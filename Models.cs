using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace UitWebDay;

// =========================================================================
// Thực thể lưu trong CSDL (mục 4.4)
//   Event        { Id, Title, Time, Location, Capacity }  (+ thông tin hiển thị)
//   Registration { Id, EventId, FullName, Email, Mssv, CreatedAt }
// =========================================================================

public class Event
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public DateTime Time { get; set; }          // giờ bắt đầu (giờ Việt Nam)
    public DateTime EndTime { get; set; }       // giờ kết thúc
    public string Location { get; set; } = "";
    public int Capacity { get; set; }

    // Thông tin hiển thị cho màn Detail (khớp thiết kế Figma)
    public string Category { get; set; } = "";
    public string Description { get; set; } = "";
    public string Highlights { get; set; } = "";   // mỗi ý một dòng

    public List<Registration> Registrations { get; set; } = new();
}

public class Registration
{
    public int Id { get; set; }
    public int EventId { get; set; }
    public Event? Event { get; set; }
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";     // đã chuẩn hóa: trim + chữ thường
    public string Mssv { get; set; } = "";
    public DateTime CreatedAt { get; set; }     // UTC
}

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Registration> Registrations => Set<Registration>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Event>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Location).HasMaxLength(200).IsRequired();
        });

        b.Entity<Registration>(r =>
        {
            r.Property(x => x.FullName).HasMaxLength(100).IsRequired();
            r.Property(x => x.Email).HasMaxLength(254).IsRequired();
            r.Property(x => x.Mssv).HasMaxLength(8).IsRequired();
            // Chốt chặn cuối: một email chỉ đăng ký 1 lần cho mỗi sự kiện
            r.HasIndex(x => new { x.EventId, x.Email }).IsUnique();
            r.HasOne(x => x.Event).WithMany(e => e.Registrations).HasForeignKey(x => x.EventId);
        });
    }
}

// =========================================================================
// DTO trao đổi qua API (JSON camelCase)
// =========================================================================

public record EventDto(
    int Id, string Title, string Category, DateTime Time, DateTime EndTime,
    string Location, string Description, string[] Highlights,
    int Capacity, int Registered, int Remaining)
{
    public static EventDto From(Event e, int registered) => new(
        e.Id, e.Title, e.Category, e.Time, e.EndTime, e.Location, e.Description,
        e.Highlights.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        e.Capacity, registered, Math.Max(0, e.Capacity - registered));
}

public record RegistrationRequest(int EventId, string? FullName, string? Email, string? Mssv);

public record RegistrationResponse(int Id, string TicketCode, int EventId, string FullName, string Email, EventDto Event);

/// <summary>Body lỗi thống nhất: code để JS phân biệt, message để hiện, errors theo từng trường.</summary>
public record ErrorResponse(string Code, string Message, Dictionary<string, string>? Errors = null);

// =========================================================================
// Validate phía server — cùng luật với js/app.js (không tin client)
// =========================================================================

public static partial class Validation
{
    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"^\d{8}$")]
    private static partial Regex MssvRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    public static (string FullName, string Email, string Mssv) Normalize(RegistrationRequest r) => (
        Spaces().Replace((r.FullName ?? "").Trim(), " "),
        (r.Email ?? "").Trim().ToLowerInvariant(),
        (r.Mssv ?? "").Trim());

    public static Dictionary<string, string> Validate(string fullName, string email, string mssv)
    {
        var errors = new Dictionary<string, string>();

        if (fullName.Length == 0) errors["fullName"] = "Vui lòng nhập họ và tên";
        else if (fullName.Length > 100) errors["fullName"] = "Họ và tên tối đa 100 ký tự";

        if (email.Length == 0) errors["email"] = "Vui lòng nhập email";
        else if (email.Length > 254 || !EmailRegex().IsMatch(email)) errors["email"] = "Email không đúng định dạng";

        if (mssv.Length == 0) errors["mssv"] = "Vui lòng nhập MSSV";
        else if (!MssvRegex().IsMatch(mssv)) errors["mssv"] = "MSSV phải gồm đúng 8 chữ số";

        return errors;
    }
}

// =========================================================================
// Dữ liệu mẫu: 3 sự kiện, sự kiện Showcase chỉ 3 chỗ để demo "hết chỗ"
// =========================================================================

public static class Seed
{
    public static void Run(AppDb db)
    {
        if (db.Events.Any()) return;

        db.Events.AddRange(
            new Event
            {
                Title = "Tech Seminar: Building Modern Web with React & Next.js",
                Category = "Web Development",
                Time = new DateTime(2026, 11, 24, 8, 0, 0),
                EndTime = new DateTime(2026, 11, 24, 11, 30, 0),
                Location = "Hội trường A · Cơ sở chính",
                Capacity = 50,
                Description = "Khám phá cách xây dựng ứng dụng web hiện đại với React và Next.js qua một demo thực tế, từ tổ chức giao diện đến tối ưu trải nghiệm người dùng.",
                Highlights = "Tổ chức giao diện thành các component tái sử dụng.\nLàm quen với routing và rendering trong Next.js.\nTheo dõi demo và trao đổi trực tiếp với diễn giả.",
            },
            new Event
            {
                Title = "Workshop: Thiết kế giao diện web với Figma",
                Category = "UI/UX Design",
                Time = new DateTime(2026, 11, 24, 13, 30, 0),
                EndTime = new DateTime(2026, 11, 24, 15, 30, 0),
                Location = "Phòng B1.14 · Tòa B",
                Capacity = 30,
                Description = "Thực hành dựng design system nhỏ trong Figma: Variables, component có variants, Auto Layout và bàn giao cho lập trình viên bằng Dev Mode.",
                Highlights = "Tạo Variables màu Light/Dark và đặt Code Syntax cho CSS.\nDựng component Button, Input với đầy đủ trạng thái.\nĐọc thông số trong Dev Mode và chuyển thành HTML/CSS.",
            },
            new Event
            {
                Title = "Showcase: Dự án web của sinh viên UIT",
                Category = "Showcase",
                Time = new DateTime(2026, 11, 24, 16, 0, 0),
                EndTime = new DateTime(2026, 11, 24, 17, 0, 0),
                Location = "Sảnh tòa E",
                Capacity = 3, // nhỏ để demo trường hợp hết chỗ (409)
                Description = "Các nhóm sinh viên trình bày dự án web nổi bật trong học kỳ, kèm phần hỏi đáp và bình chọn dự án được yêu thích nhất.",
                Highlights = "Xem demo trực tiếp các dự án web của sinh viên.\nTrao đổi kinh nghiệm làm việc nhóm và triển khai.\nBình chọn dự án được yêu thích nhất.",
            });

        db.SaveChanges();
    }
}
