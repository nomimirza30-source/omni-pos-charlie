using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using OmniPOS.Api.Middleware;
using OmniPOS.Api.Services.Payments;
using OmniPOS.Api.Data;
using OmniPOS.Api.Services;
using OmniPOS.Api.Hubs;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using System.Collections.Generic;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

// Register DbContext (Forced SQLite for local stability)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=omnipos_v6.db";
Console.WriteLine($"[DEBUG] Using ConnectionString: {connectionString}");
Console.WriteLine($"[DEBUG] Current Directory: {Directory.GetCurrentDirectory()}");

builder.Services.AddDbContext<OmniDbContext>(options =>
    options.UseSqlite(connectionString));



builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin => true) // Allow any origin dynamically
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // Required for SignalR
    });
});

builder.Services.AddScoped<ITenantProvider, TenantProvider>();
builder.Services.AddScoped<IPaymentGateway, BankSelectorDriver>();
builder.Services.AddScoped<QrCodeService>();
builder.Services.AddHttpClient<IWiseService, WiseService>();
// builder.Services.AddScoped<VIPService>(); // Shadow VIP Service removed

// Phase 3: JWT & RBAC Configuration
var jwtKey = builder.Configuration["Jwt:Key"] ?? "a_very_secure_and_long_secret_key_for_omnipos_2026";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "OmniPOS";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtIssuer,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
        
        // SignalR Token Reader
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdmin", policy => policy.RequireRole("Admin", "Owner"));
    options.AddPolicy("RequireManager", policy => policy.RequireRole("Admin", "Owner", "Manager"));
    options.AddPolicy("RequireServer", policy => policy.RequireRole("Admin", "Owner", "Manager", "Server", "Waiter", "Till", "Kitchen", "Chef", "Assistant Chef"));
    options.AddPolicy("RequireKitchen", policy => policy.RequireRole("Admin", "Owner", "Manager", "Kitchen"));
});

var app = builder.Build();

// Ensure database is created (Critical for SQLite bootstrap)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<OmniDbContext>();
        context.Database.EnsureCreated();

        // Manual Schema Update for Wise Integration (since Migrations are tricky here)
        try 
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN WiseApiKey TEXT DEFAULT ''");
            context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN WiseProfileId TEXT DEFAULT ''");
            Console.WriteLine("[Schema] Added Wise columns to Tenants table.");
        }
        catch (Exception) { /* Columns likely exist, ignore */ }
        // var context already declared above
        Console.WriteLine("[DEBUG] EF GenerateCreateScript Output:");
        Console.WriteLine(context.Database.GenerateCreateScript());
        context.Database.EnsureCreated();
        Console.WriteLine("[Database] SQLite Initialized.");

        // Manual Schema Update for Payment Adjustments
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN ServiceCharge DECIMAL(18,2) DEFAULT 0");
            Console.WriteLine("[Database] Added ServiceCharge column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] ServiceCharge column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN Discount DECIMAL(18,2) DEFAULT 0");
            Console.WriteLine("[Database] Added Discount column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] Discount column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN DiscountType TEXT DEFAULT 'none'");
            Console.WriteLine("[Database] Added DiscountType column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] DiscountType column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN FinalTotal DECIMAL(18,2) DEFAULT 0");
            Console.WriteLine("[Database] Added FinalTotal column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] FinalTotal column skip: {ex.Message}"); }

        // Additional missing columns for Workflow and Sync
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN WorkflowStatus TEXT DEFAULT 'Pending'");
            Console.WriteLine("[Database] Added WorkflowStatus column.");
        } catch { }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN CanAmend INTEGER DEFAULT 1");
            Console.WriteLine("[Database] Added CanAmend column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] CanAmend column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN StatusHistory TEXT DEFAULT '[]'");
            Console.WriteLine("[Database] Added StatusHistory column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] StatusHistory column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN CustomerId TEXT");
            Console.WriteLine("[Database] Added CustomerId column to Orders.");
        } catch (Exception ex) { Console.WriteLine($"[Database] CustomerId column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN PaidAt TEXT");
            Console.WriteLine("[Database] Added PaidAt column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] PaidAt column skip: {ex.Message}"); }
        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN DiscountReason TEXT");
            Console.WriteLine("[Database] Added DiscountReason column.");
        } catch { }

        try
        {
            context.Database.ExecuteSqlRaw("ALTER TABLE Orders ADD COLUMN IsAmended INTEGER DEFAULT 0");
            Console.WriteLine("[Database] Added IsAmended column.");
        } catch (Exception ex) { Console.WriteLine($"[Database] IsAmended column skip: {ex.Message}"); }

        // Manual Schema Update for Tenants (Branding & Handles)
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN AppName TEXT DEFAULT 'OmniPOS'"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN SiteUrl TEXT DEFAULT ''"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN LogoUrl TEXT DEFAULT ''"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN PrimaryColor TEXT DEFAULT '#38bdf8'"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN SecondaryColor TEXT DEFAULT '#818cf8'"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN ThemeMode TEXT DEFAULT 'dark'"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN WiseHandle TEXT DEFAULT ''"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN RevolutHandle TEXT DEFAULT ''"); } catch { }
        try { context.Database.ExecuteSqlRaw("ALTER TABLE Tenants ADD COLUMN CardPaymentUrl TEXT DEFAULT ''"); } catch { }
        Console.WriteLine("[Database] Tenants branding columns ensured.");



        // 1. Seed Tenant
        var tenants = context.Tenants.IgnoreQueryFilters().ToList();
        Console.WriteLine($"[Database] Current Tenant Count: {tenants.Count}");
        
        if (tenants.Count == 0)
        {
            Console.WriteLine("[Database] Initializing SQLite database...");
            context.Database.EnsureCreated();
            
            var customerType = context.Model.FindEntityType(typeof(Customer));
            var customerProps = customerType?.GetProperties().Select(p => p.Name) ?? Enumerable.Empty<string>();
            Console.WriteLine("[DEBUG] Customer Properties in EF Model: " + string.Join(", ", customerProps));
            
            var orderType = context.Model.FindEntityType(typeof(Order));
            var orderProps = orderType?.GetProperties().Select(p => p.Name) ?? Enumerable.Empty<string>();
            Console.WriteLine("[DEBUG] Order Properties in EF Model: " + string.Join(", ", orderProps));
            
            var tenantId = Guid.NewGuid();
            context.Tenants.Add(new Tenant 
            { 
                TenantId = tenantId, 
                Name = "IYI Luxury Dining - London", 
                AppName = "IYI Luxury Dining",
                PrimaryColor = "#38bdf8"
            });
            context.SaveChanges();
            Console.WriteLine("[Database] Tenant seeded successfully.");
        }

        // 2. Seed Staff
        var staffList = context.StaffMembers.IgnoreQueryFilters().ToList();
        Console.WriteLine($"[Database] Current Staff Count: {staffList.Count}");
        
        if (staffList.Count == 0)
        {
            Console.WriteLine("[Database] Staff table empty. Seeding default accounts...");
            var tenant = context.Tenants.IgnoreQueryFilters().First();
            Console.WriteLine($"[Database] Using Tenant: {tenant.Name} ({tenant.TenantId})");
            
            var adminStaff = new Staff 
            { 
                StaffId = Guid.NewGuid(), 
                TenantId = tenant.TenantId, 
                FullName = "System Admin", 
                Role = "Admin", 
                Username = "admin", 
                PasswordHash = OmniPOS.Api.Services.PasswordHasher.HashPassword("admin123"), 
                Email = "admin@omnipos.com" 
            };
            
            var kitchenStaff = new Staff 
            { 
                StaffId = Guid.NewGuid(), 
                TenantId = tenant.TenantId, 
                FullName = "Kitchen Staff", 
                Role = "Kitchen", 
                Username = "kitchen", 
                PasswordHash = OmniPOS.Api.Services.PasswordHasher.HashPassword("kitchen123"), 
                Email = "kitchen@omnipos.com" 
            };
            
            var waiterStaff = new Staff 
            { 
                StaffId = Guid.NewGuid(), 
                TenantId = tenant.TenantId, 
                FullName = "Senior Waiter", 
                Role = "Waiter", 
                Username = "waiter", 
                PasswordHash = OmniPOS.Api.Services.PasswordHasher.HashPassword("waiter123"), 
                Email = "waiter@omnipos.com" 
            };
 
            var tillStaff = new Staff
            {
                StaffId = Guid.NewGuid(),
                TenantId = tenant.TenantId,
                FullName = "Main Till",
                Role = "Till",
                Username = "till",
                PasswordHash = OmniPOS.Api.Services.PasswordHasher.HashPassword("till123"),
                Email = "till@omnipos.com"
            };
            
            context.StaffMembers.AddRange(adminStaff, kitchenStaff, waiterStaff, tillStaff);
            context.SaveChanges();
            Console.WriteLine("[Database] Staff accounts seeded successfully.");
        }

        Console.WriteLine("[Database] Bootstrap sequence complete.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Database] CRITICAL ERROR during bootstrap: {ex.Message}");
        if (ex.InnerException != null) Console.WriteLine($"[Inner] {ex.InnerException.Message}");
    }
}

// Configure the HTTP request pipeline.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    // Trust all proxies in the local network (Docker environment)
    KnownNetworks = { },
    KnownProxies = { }
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// app.UseHttpsRedirection(); // Disabled for HTTP-only testing until SSL is ready

app.UseStaticFiles();

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantMiddleware>();

app.MapControllers();

app.MapGet("/api/debug/sql-query", async (OmniDbContext db, string sql) => {
    try {
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var reader = await command.ExecuteReaderAsync();
        var result = new List<Dictionary<string, object>>();
        while (await reader.ReadAsync()) {
            var row = new Dictionary<string, object>();
            for (int i = 0; i < reader.FieldCount; i++) {
                row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            result.Add(row);
        }
        return Results.Ok(result);
    } catch (Exception ex) {
        return Results.Problem(ex.Message);
    }
});

app.MapGet("/api/debug/sql", async (OmniDbContext db, string sql) => {
    try {
        int affected = await db.Database.ExecuteSqlRawAsync(sql);
        return Results.Ok(new { affected, status = "Success" });
    } catch (Exception ex) {
        return Results.Problem(ex.Message);
    }
});

app.MapGet("/api/debug/ping", () => "Pong");

app.MapGet("/api/auth/debug-staff", async (OmniDbContext db) => {
    var staff = await db.StaffMembers.IgnoreQueryFilters().ToListAsync();
    return Results.Ok(staff.Select(s => new { s.Username, s.Role, s.FullName }));
});

app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();
