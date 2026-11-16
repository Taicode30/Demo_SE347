using Microsoft.EntityFrameworkCore;
using UitWebDay;

var builder = WebApplication.CreateBuilder(args);

// Render / Railway… cấp cổng qua biến môi trường PORT
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port)) builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=uitwebday.db"));

// Chỉ cần CORS khi hệ khách chạy ở domain khác (vd Live Server cổng 5500 lúc code giao diện).
// Khi deploy, server phục vụ luôn root (cùng domain) nên không dùng tới.
builder.Services.AddCors(o => o.AddPolicy("dev-live-server", p => p
    .WithOrigins("http://localhost:5500", "http://127.0.0.1:5500")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Tạo CSDL + seed 3 sự kiện ở lần chạy đầu
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    Seed.Run(db);
}

if (app.Environment.IsDevelopment()) app.UseCors("dev-live-server");

app.UseDefaultFiles();   // "/" → root/index.html
app.UseStaticFiles();    // css, js, img

// Khóa để kiểm tra chỗ + ghi dữ liệu là một bước: cả lớp quét QR đăng ký cùng lúc
// thì sự kiện 3 chỗ không bị nhận quá 3 người.
var registerLock = new SemaphoreSlim(1, 1);

// -------------------------------------------------------------------------
// GET /api/events — danh sách sự kiện + số chỗ còn
// -------------------------------------------------------------------------
app.MapGet("/api/events", async (AppDb db) =>
{
    var rows = await db.Events.AsNoTracking()
        .OrderBy(e => e.Time)
        .Select(e => new { Event = e, Registered = e.Registrations.Count })
        .ToListAsync();

    return Results.Ok(rows.Select(r => EventDto.From(r.Event, r.Registered)));
});

// -------------------------------------------------------------------------
// POST /api/registrations — đăng ký
//   201 thành công · 400 dữ liệu sai · 409 hết chỗ / email đã đăng ký sự kiện này
// -------------------------------------------------------------------------
app.MapPost("/api/registrations", async (RegistrationRequest? req, AppDb db) =>
{
    if (req is null)
        return Results.BadRequest(new ErrorResponse("INVALID_BODY", "Dữ liệu gửi lên không hợp lệ."));

    // 1. Validate lại (không tin client)
    var (fullName, email, mssv) = Validation.Normalize(req);
    var errors = Validation.Validate(fullName, email, mssv);
    if (errors.Count > 0)
        return Results.BadRequest(new ErrorResponse("VALIDATION_FAILED",
            "Vui lòng kiểm tra lại các trường được đánh dấu.", errors));

    await registerLock.WaitAsync();
    try
    {
        // 2. Sự kiện phải tồn tại
        var ev = await db.Events.FindAsync(req.EventId);
        if (ev is null)
            return Results.BadRequest(new ErrorResponse("EVENT_NOT_FOUND", "Sự kiện không tồn tại.",
                new() { ["eventId"] = "Sự kiện không tồn tại." }));

        // 3. Không trùng email trong cùng sự kiện
        if (await db.Registrations.AnyAsync(r => r.EventId == ev.Id && r.Email == email))
            return Results.Conflict(DuplicateEmail());

        // 4. Còn chỗ
        var registered = await db.Registrations.CountAsync(r => r.EventId == ev.Id);
        if (registered >= ev.Capacity)
            return Results.Conflict(new ErrorResponse("EVENT_FULL",
                "Rất tiếc, toàn bộ chỗ của sự kiện này đã được đăng ký. Bạn có thể xem các sự kiện khác của UIT Web Day."));

        // 5. Lưu CSDL
        var reg = new Registration
        {
            EventId = ev.Id,
            FullName = fullName,
            Email = email,
            Mssv = mssv,
            CreatedAt = DateTime.UtcNow,
        };
        db.Registrations.Add(reg);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Unique index (EventId, Email) chặn trường hợp hiếm còn sót
            return Results.Conflict(DuplicateEmail());
        }

        var body = new RegistrationResponse(
            reg.Id, TicketCode(reg.Id), ev.Id, reg.FullName, reg.Email,
            EventDto.From(ev, registered + 1));

        return Results.Created($"/api/registrations/{reg.Id}", body);
    }
    finally
    {
        registerLock.Release();
    }
});

// -------------------------------------------------------------------------
// GET /admin — trang HTML render từ server, tự tải lại mỗi 5 giây
// Chỉ hiện Họ tên + MSSV đã che, KHÔNG hiện email (trang này chiếu lên lớp).
// -------------------------------------------------------------------------
app.MapGet("/admin", async (AppDb db) =>
{
    var latest = await db.Registrations.AsNoTracking()
        .OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
        .Take(200)
        .Select(r => new AdminPage.Row(r.CreatedAt, r.Event!.Title, r.FullName, r.Mssv))
        .ToListAsync();

    var totals = await db.Events.AsNoTracking()
        .OrderBy(e => e.Time)
        .Select(e => new AdminPage.Total(e.Title, e.Registrations.Count, e.Capacity))
        .ToListAsync();

    return Results.Content(AdminPage.Render(latest, totals), "text/html; charset=utf-8");
});

app.Run();

static ErrorResponse DuplicateEmail() => new("DUPLICATE_EMAIL",
    "Mỗi email chỉ đăng ký được một lần cho mỗi sự kiện. Hãy kiểm tra hộp thư hoặc dùng email khác.",
    new() { ["email"] = "Email này đã được dùng để đăng ký sự kiện" });

static string TicketCode(int id) => $"WEB-2026-{id:D4}";
