using Microsoft.EntityFrameworkCore;
using OmniPOS.Api.Middleware;

namespace OmniPOS.Api.Data;

public class OmniDbContext : DbContext
{
    private readonly Guid? _tenantId;

    public OmniDbContext(DbContextOptions<OmniDbContext> options, ITenantProvider tenantProvider)
        : base(options)
    {
        _tenantId = tenantProvider.TenantId;
    }

    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<Staff> StaffMembers { get; set; }
    public DbSet<Category> Categories { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<RestaurantTable> RestaurantTables { get; set; }
    public DbSet<InventoryItem> InventoryItems { get; set; }
    public DbSet<MenuRecipe> MenuRecipes { get; set; }
    public DbSet<StaffShift> StaffShifts { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<Customer> Customers { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply Global Query Filter for Multi-tenancy
        modelBuilder.Entity<Staff>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<Category>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<Product>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<Order>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<OrderItem>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<RestaurantTable>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<InventoryItem>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<StaffShift>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<Notification>().HasQueryFilter(x => x.TenantId == _tenantId);
        modelBuilder.Entity<Customer>().HasQueryFilter(x => x.TenantId == _tenantId);


        // Composite Key for Recipes
        modelBuilder.Entity<MenuRecipe>()
            .HasKey(r => new { r.ProductId, r.InventoryItemId });

        // Configure relationships and TenantId enforcement
        modelBuilder.Entity<Order>()
            .Property(o => o.VectorClock)
            .IsRequired();
    }

    public override int SaveChanges()
    {
        EnforceTenantId();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        EnforceTenantId();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void EnforceTenantId()
    {
        var entries = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified);

        foreach (var entry in entries)
        {
            if (entry.Entity is ITenantEntity tenantEntity)
            {
                if (entry.State == EntityState.Added)
                {
                    // During seeding (no HTTP context), allow entities with pre-set TenantId
                    if (_tenantId == null)
                    {
                        // Seeding mode: require that TenantId is already set on the entity
                        if (tenantEntity.TenantId == Guid.Empty)
                        {
                            throw new InvalidOperationException("TenantId must be set on entity before adding during seeding.");
                        }
                    }
                    else
                    {
                        // Normal mode: auto-assign from context
                        tenantEntity.TenantId = _tenantId.Value;
                    }
                }
                else if (_tenantId != null && tenantEntity.TenantId != _tenantId)
                {
                    throw new InvalidOperationException("Cannot modify data across tenants.");
                }
            }
        }
    }
}

public interface ITenantEntity
{
    Guid TenantId { get; set; }
}

public class Tenant
{
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AppName { get; set; } = "OmniPOS";
    public string SiteUrl { get; set; } = string.Empty; // Public URL for QR codes
    public string LogoUrl { get; set; } = string.Empty;
    public string PrimaryColor { get; set; } = "#38bdf8"; // Default Sky Blue
    public string SecondaryColor { get; set; } = "#818cf8"; // Default Indigo
    public string ThemeMode { get; set; } = "dark"; // dark or light
    public string WiseHandle { get; set; } = string.Empty; // For automated "Approve/Reject" links
    public string RevolutHandle { get; set; } = string.Empty; // For automated Revolut payment links
    public string CardPaymentUrl { get; set; } = string.Empty; // For card payment (e.g. Stripe/Square link)
    public string WiseApiKey { get; set; } = string.Empty; // For Wise API Integration
    public string WiseProfileId { get; set; } = string.Empty; // For Wise API Integration
}

public class Staff : ITenantEntity
{
    public Guid StaffId { get; set; }
    public Guid TenantId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty; // Admin, Manager, Waiter, Kitchen
    
    // Auth Fields
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    // NIST/GDPR Sensitive Data (Target for Always Encrypted)
    public string NINumber { get; set; } = string.Empty;
    public string BankDetails { get; set; } = string.Empty;

    // Rota/Payroll Fields
    public decimal PayRate { get; set; } = 0.00m;
    public string WorkingDays { get; set; } = "[]"; // JSON array of days
    public string Status { get; set; } = "Active"; // Active, Inactive, OnLeave
}

public class Category : ITenantEntity
{
    public Guid CategoryId { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class Product : ITenantEntity
{
    public Guid ProductId { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}

public class Order : ITenantEntity
{
    public Guid OrderId { get; set; }
    public Guid TenantId { get; set; }
    public Guid? StaffId { get; set; }
    public Guid? CustomerId { get; set; } // Shadow VIP: Link to Customer profile
    public string CustomerName { get; set; } = string.Empty;
    public string TableId { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = "Pending";
    public string VectorClock { get; set; } = "{}";
    public string MetadataJson { get; set; } = "[]"; // For storing items as JSON in MVP or extensibility
    public string PendingAmendmentsJson { get; set; } = "[]"; // For proposed changes (adds/deletes)
    public string Notes { get; set; } = string.Empty;
    public int GuestCount { get; set; } = 1;
    public string PaymentMethod { get; set; } = string.Empty; // Cash, Card, etc.

    // Payment Adjustments
    public decimal ServiceCharge { get; set; } = 0; // Service charge amount
    public decimal Discount { get; set; } = 0; // Discount amount
    public string DiscountType { get; set; } = "none"; // "percentage", "amount", or "none"
    public decimal FinalTotal { get; set; } = 0; // Total after service charge and discount

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; } // Settled timestamp

    // Workflow Status (Pending → Preparing → Ready → Served → Paid)
    public string WorkflowStatus { get; set; } = "Pending";
    public bool CanAmend { get; set; } = true; // False after Paid
    public string StatusHistory { get; set; } = "[]"; // JSON array of {status, timestamp, userId}
    public string DiscountReason { get; set; } = string.Empty;
    public bool IsAmended { get; set; } = false;
}

public class OrderItem : ITenantEntity
{
    public Guid OrderItemId { get; set; }
    public Guid OrderId { get; set; }
    public string ProductId { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public Guid TenantId { get; set; }
}

public class RestaurantTable : ITenantEntity
{
    public Guid RestaurantTableId { get; set; }
    public Guid TenantId { get; set; }
    public string TableNumber { get; set; } = string.Empty;
    public int Capacity { get; set; }
    public string Status { get; set; } = "Available";
    public int PosX { get; set; }
    public int PosY { get; set; }
}

public class InventoryItem : ITenantEntity
{
    public Guid InventoryItemId { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SKU { get; set; } = string.Empty;
    public decimal CurrentStock { get; set; }
    public decimal MinThreshold { get; set; }
    public string Unit { get; set; } = "units";
}

public class MenuRecipe
{
    public Guid ProductId { get; set; }
    public Guid InventoryItemId { get; set; }
    public decimal Quantity { get; set; }
}

public class StaffShift : ITenantEntity
{
    public Guid StaffShiftId { get; set; }
    public Guid StaffId { get; set; }
    public Guid TenantId { get; set; }
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset EndTime { get; set; }
    public DateTimeOffset? ActualStartTime { get; set; }
    public DateTimeOffset? ActualEndTime { get; set; }
}

public class Notification : ITenantEntity
{
    public Guid NotificationId { get; set; }
    public Guid TenantId { get; set; }
    public Guid? OrderId { get; set; } // Link to order if applicable
    public string TargetRole { get; set; } = string.Empty; // Waiter, Kitchen, Manager, etc.
    public Guid? TargetUserId { get; set; } // Optional specific user
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = "OrderUpdate"; // OrderUpdate, StatusChange, etc.
    public bool IsRead { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Customer : ITenantEntity
{
    public Guid CustomerId { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    
    // Basic Loyalty Fields
    public int TotalOrders { get; set; } = 0;
    public decimal TotalSpend { get; set; } = 0;
    public DateTime LastVisit { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
