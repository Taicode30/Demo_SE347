using System.Net;
using System.Text;

namespace UitWebDay;

/// <summary>Trang /admin render phía server (không dùng JS).</summary>
public static class AdminPage
{
    public record Row(DateTime CreatedAtUtc, string EventTitle, string FullName, string Mssv);
    public record Total(string Title, int Registered, int Capacity);

    private static string E(string s) => WebUtility.HtmlEncode(s);

    /// <summary>24521544 → 2452****</summary>
    public static string MaskMssv(string mssv) =>
        mssv.Length <= 4 ? new string('*', mssv.Length) : mssv[..4] + new string('*', mssv.Length - 4);

    public static string Render(IReadOnlyList<Row> rows, IReadOnlyList<Total> totals)
    {
        var vn = TimeSpan.FromHours(7);
        var sb = new StringBuilder();

        sb.Append("""
            <!DOCTYPE html>
            <html lang="vi" data-theme="light">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta http-equiv="refresh" content="5">
              <meta name="robots" content="noindex">
              <title>Admin · UIT Web Day</title>
              <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
              <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap">
              <link rel="stylesheet" href="/css/tokens.css">
              <style>
                body { margin: 0; font: var(--font-body); color: var(--color-text); background: var(--color-surface); }
                .wrap { width: min(1200px, 100% - 32px); margin: 0 auto; padding: 32px 0 48px; display: flex; flex-direction: column; gap: 24px; }
                header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }
                h1 { font: var(--font-h1); margin: 0; }
                h2 { font: var(--font-h2); margin: 0 0 12px; }
                .muted { color: var(--color-text-muted); font: var(--font-small); }
                .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
                .total { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
                .total__title { font: var(--font-label); }
                .total__count { font: var(--font-h1); }
                .bar { height: 8px; border-radius: var(--radius-full); background: var(--color-border); overflow: hidden; }
                .bar > span { display: block; height: 100%; background: var(--color-primary); }
                .full .bar > span { background: var(--color-error); }
                .full .total__count { color: var(--color-error); }
                .card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
                table { width: 100%; border-collapse: collapse; }
                th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
                th { font: var(--font-label); background: var(--color-surface); }
                td { font: var(--font-body); }
                tbody tr:first-child { background: var(--color-success-bg); }
                .mono { font-variant-numeric: tabular-nums; letter-spacing: .04em; }
                .empty { padding: 24px 16px; color: var(--color-text-muted); }
              </style>
            </head>
            <body>
            <div class="wrap">
            """);

        var total = totals.Sum(t => t.Registered);
        sb.Append($"""
              <header>
                <h1>Đăng ký UIT Web Day</h1>
                <p class="muted">Tổng {total} lượt · tự tải lại mỗi 5 giây · cập nhật {DateTime.UtcNow.Add(vn):HH:mm:ss}</p>
              </header>
              <section>
                <h2>Tổng số theo sự kiện</h2>
                <div class="totals">
            """);

        foreach (var t in totals)
        {
            var pct = t.Capacity == 0 ? 100 : Math.Min(100, t.Registered * 100 / t.Capacity);
            var full = t.Registered >= t.Capacity ? " full" : "";
            sb.Append($"""
                  <div class="total{full}">
                    <span class="total__title">{E(t.Title)}</span>
                    <span class="total__count">{t.Registered}/{t.Capacity}</span>
                    <div class="bar" role="img" aria-label="{pct}%"><span style="width:{pct}%"></span></div>
                  </div>
            """);
        }

        sb.Append("""
                </div>
              </section>
              <section>
                <h2>Đăng ký mới nhất</h2>
                <div class="card">
            """);

        if (rows.Count == 0)
        {
            sb.Append("""<p class="empty">Chưa có lượt đăng ký nào. Mời cả lớp quét QR!</p>""");
        }
        else
        {
            sb.Append("""
                  <table>
                    <thead><tr><th>Thời gian</th><th>Họ tên</th><th>MSSV</th><th>Sự kiện</th></tr></thead>
                    <tbody>
                """);
            foreach (var r in rows)
            {
                sb.Append($"""
                      <tr>
                        <td class="mono">{r.CreatedAtUtc.Add(vn):HH:mm:ss}</td>
                        <td>{E(r.FullName)}</td>
                        <td class="mono">{E(MaskMssv(r.Mssv))}</td>
                        <td>{E(r.EventTitle)}</td>
                      </tr>
                """);
            }
            sb.Append("</tbody></table>");
        }

        sb.Append("""
                </div>
              </section>
            </div>
            </body>
            </html>
            """);

        return sb.ToString();
    }
}
