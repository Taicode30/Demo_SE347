# UIT Web Day 2026 – Website đăng ký sự kiện

Demo seminar **SE347 – Nhóm 1**: *Từ Figma đến website thật*.
Thiết kế: Figma file **Quản lý sự kiện** (Variables Light/Dark, component `Button`, `Input`, `Card/Event`, 8 màn × Mobile 375 / Desktop 1440).

```
UitWebDay/
├── Program.cs            # API + /admin + phục vụ wwwroot (cùng domain → không cần CORS)
├── Models.cs             # Event, Registration, DTO, validate, seed 3 sự kiện
├── AdminPage.cs          # HTML trang /admin (render phía server)
├── UitWebDay.csproj      # .NET 8 + EF Core SQLite
├── Dockerfile            # deploy Render
├── dev/mock-server.mjs   # server giả bằng Node (khi chưa cài .NET)
└── wwwroot/              # HỆ KHÁCH
    ├── index.html        # Home + Detail + Form + Success (một trang, chuyển bằng section)
    ├── css/tokens.css    # :wwwroot (Light) + [data-theme="dark"] — trùng tên Figma Variables
    ├── css/style.css     # .btn, .card-event, .input, layout, @media
    ├── js/app.js         # validate, fetch, cập nhật DOM
    └── img/              # SVG export từ Figma (hero, icon, QR minh họa)
```

## Chạy thử

**Cách 1 – Server thật (ASP.NET Core, cần .NET 8 SDK)**

```bash
dotnet run
# mở http://localhost:5000  ·  trang quản trị: http://localhost:5000/admin
```

Lần chạy đầu tự tạo file `uitwebday.db` (SQLite) và seed 3 sự kiện.

**Cách 2 – Chỉ làm giao diện (không cần .NET)**

```bash
node dev/mock-server.mjs        # http://localhost:5000, dữ liệu lưu trong RAM
DELAY_MS=2000 node dev/mock-server.mjs   # giả lập mạng chậm để xem trạng thái "Đang gửi…"
```

**Cách 3 – VS Code Live Server (cổng 5500)**: `app.js` tự gọi API ở `http://localhost:5000`; server chạy ở chế độ Development đã bật CORS cho cổng 5500.

## API

| Method | Đường dẫn | Kết quả |
|---|---|---|
| GET | `/api/events` | `200` `[{ id, title, category, time, endTime, location, description, highlights[], capacity, registered, remaining }]` |
| POST | `/api/registrations` | body `{ eventId, fullName, email, mssv }` → `201` `{ id, ticketCode, eventId, fullName, email, event }` |
| | | `400` `{ code: "VALIDATION_FAILED" \| "EVENT_NOT_FOUND", message, errors: { field: message } }` |
| | | `409` `{ code: "EVENT_FULL" \| "DUPLICATE_EMAIL", message, errors? }` |
| GET | `/admin` | HTML, tự tải lại mỗi 5 giây, chỉ hiện **Họ tên + MSSV đã che** (`2452****`), không hiện email |

Luật validate giống nhau ở client (`app.js` → `RULES`) và server (`Models.cs` → `Validation`):
không bỏ trống · email đúng định dạng · MSSV đúng 8 chữ số. Server kiểm tra thêm: sự kiện tồn tại, còn chỗ, không trùng email trong cùng sự kiện (có cả unique index trong CSDL). Đoạn kiểm tra chỗ + ghi dữ liệu được khóa (`SemaphoreSlim`) để cả lớp đăng ký cùng lúc cũng không vượt số chỗ.

## Đối chiếu Figma ↔ code

| Figma | Code |
|---|---|
| Variable `color/primary` (Code syntax `var(--color-primary)`) | `--color-primary` trong `tokens.css` |
| Mode Light / Dark | `:root` / `[data-theme="dark"]` (nút mặt trăng trên header) |
| `Button` · Auto Layout ngang, padding 12/20, gap 8, Hug | `.btn { display:inline-flex; gap; padding }` |
| `Button` · Type=Primary/Secondary × State=Default/Hover/Disabled | `.btn--primary`, `.btn--secondary`, `:hover`, `:disabled` |
| `Input` · State=Default/Hover/Disabled/Error | `.input__field:hover`, `:disabled`, `.input--error` |
| `Card/Event` · Status=Còn chỗ/Hết chỗ | `<article class="card-event">`, `.card-event--full` |
| Frame Desktop 1440 / Mobile 375 | `@media (max-width: 768px)` → 1 cột, bottom bar ở đáy |
| screen-form-error / -submitting / error-duplicate / error-full | `input--error`, nút "Đang gửi…", alert 409 trùng email / hết chỗ |

## Kịch bản demo trên lớp

- **Lỗi client:** bấm *Xác nhận đăng ký* khi để trống → 3 ô chuyển State=Error.
- **201:** DevTools → Network → `POST /api/registrations` → `201 Created`, rồi mở `/admin`.
- **409 trùng email:** đăng ký lại cùng email cho cùng sự kiện.
- **409 hết chỗ:** sự kiện *Showcase* chỉ có **3 chỗ**. Mở sẵn form đăng ký Showcase trên máy chiếu *trước* khi cả lớp quét QR; khi lớp đã đăng ký hết 3 chỗ thì bấm gửi → server trả 409 → hiện khung "Sự kiện đã hết chỗ" giống Figma. (Nếu tải lại trang khi đã hết chỗ, nút đăng ký bị khóa ngay từ đầu.)
- **Lỗi mạng:** DevTools → Network → Offline → gửi form → "Không kết nối được, thử lại".

## Deploy (Render, gói free)

1. Đẩy repo lên GitHub → Render → **New Web Service** → chọn repo → Runtime **Docker**.
2. Render tự cấp biến `PORT`; `Program.cs` đã đọc biến này.
3. Mở web trước giờ thuyết trình 5–10 phút (gói free "ngủ" khi không có truy cập).

> Ổ đĩa của gói free không bền: dữ liệu SQLite mất khi service khởi động lại. Với demo trên lớp thì đủ dùng, nhưng **đừng redeploy giữa buổi**.

## Sau buổi thuyết trình

- Xóa dữ liệu thật: tắt server rồi xóa file `uitwebday.db` (chạy local) hoặc tắt/suspend service trên Render.
- Không commit file `.db` (đã có trong `.gitignore`).

## Cần sửa trước buổi demo

- Ngày sự kiện đang để **24/10/2026** theo Figma. Đổi ở `Models.cs` (`Seed`) và dòng eyebrow trong `index.html`, rồi xóa `uitwebday.db` để seed lại.
