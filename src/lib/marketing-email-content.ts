const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

const UNSUBSCRIBE_FOOTER_TEXT_AR = "إلغاء الاشتراك";

export function appendMarketingPlainTextBody(body: string, unsubscribeUrl: string): string {
  const trimmed = body.trim();
  return `${trimmed}\n\n---\n${UNSUBSCRIBE_FOOTER_TEXT_AR}: ${unsubscribeUrl}`;
}

export function buildMarketingHtmlBody(body: string, unsubscribeUrl: string): string {
  const escapedBody = escapeHtml(body.trim()).replace(/\n/g, "<br>\n");
  const escapedUrl = escapeHtml(unsubscribeUrl);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.5;">
<p>${escapedBody}</p>
<hr>
<p><a href="${escapedUrl}">${UNSUBSCRIBE_FOOTER_TEXT_AR}</a></p>
</body>
</html>`;
}

export function marketingListUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
