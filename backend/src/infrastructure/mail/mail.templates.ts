import type { SendMailOptions } from './interfaces/mail-provider.interface';

export type MailTemplate = Omit<SendMailOptions, 'to'>;

interface ActionButton {
  label: string;
  href: string;
}

interface AppEmailContent {
  preheader: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  action?: ActionButton;
  footer?: string;
}

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3002';
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function renderAppEmail(content: AppEmailContent): MailTemplate {
  const paragraphs = content.paragraphs
    .map(
      paragraph =>
        `<p style="margin:0 0 16px;color:#526174;font-size:16px;line-height:1.7;">${paragraph}</p>`,
    )
    .join('');
  const action = content.action
    ? `<a href="${escapeHtml(content.action.href)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#6558d3;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:6px 6px 12px #cbd2e0,-5px -5px 10px #ffffff;">${escapeHtml(content.action.label)}</a>`
    : '';
  const footer =
    content.footer ??
    'Nếu bạn không yêu cầu email này, bạn có thể bỏ qua nó một cách an toàn.';

  return {
    subject: content.title,
    text: [content.title, ...content.paragraphs, footer].join('\n\n'),
    html: `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.title)}</title>

    <style>
      :root {
        --color-primary: #6558d3;
      }

      .color-primary {
        color: #6558d3;
      }
    </style>
  </head>
  <body style="margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333333;line-height:1.6;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0; box-shadow:12px 12px 28px #d5dbe5,-12px -12px 28px #ffffff;">
            <tr>
              <td style="padding:20px 22px;background:#6558d3;background:linear-gradient(135deg,#6558d3,#4338ca);color:#fff">
                <h1 style="margin:24px 0 16px;color:#fff;font-size:30px;line-height:1.2;">${escapeHtml(content.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;">
                ${paragraphs}
                ${action ? `<div style="margin:32px 0 28px;  text-align:center">${action}</div>` : ''}
                <p style="margin:0;color:#7a8798;font-size:13px;line-height:1.6;">${escapeHtml(footer)}</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;font-size:12px;color:#6c757d;border-top:1px solid #e9ecef">
                <p style="margin:0;"><strong class="color-primary">Movie Recommendation</strong> - Gợi ý đúng gu của bạn</p>
                <p style="margin:0;">Website: <a href="${escapeHtml(getFrontendUrl())}" class="color-primary" style="color:#6558d3;text-decoration:none;">${escapeHtml(getFrontendUrl())}</a></p>
                <p style="margin:0;">Đây là email tự động, vui lòng không reply trực tiếp.</p>
                <p style="margin:0;">Nếu cần hỗ trợ, vui lòng liên hệ qua số hotline hoặc email support.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export function createVerificationEmailTemplate(token: string): MailTemplate {
  const verificationUrl = `${getFrontendUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;

  return renderAppEmail({
    preheader: 'Xác thực tài khoản Movie Recommendation của bạn.',
    eyebrow: 'Tài khoản',
    title: 'Xác thực tài khoản',
    paragraphs: [
      'Chào bạn, hãy xác thực email để hoàn tất việc kích hoạt tài khoản và bắt đầu nhận các gợi ý phim phù hợp.',
    ],
    action: {
      label: 'Xác thực tài khoản',
      href: verificationUrl,
    },
  });
}

export function createEmailVerifiedTemplate(): MailTemplate {
  return renderAppEmail({
    preheader: 'Email của bạn đã được xác thực thành công.',
    eyebrow: 'Bảo mật',
    title: 'Email đã được xác thực',
    paragraphs: [
      'Tài khoản Movie Recommendation của bạn đã được xác thực thành công. Bạn có thể tiếp tục khám phá những bộ phim phù hợp với sở thích.',
    ],
    footer: 'Nếu bạn không thực hiện thao tác này, hãy liên hệ đội ngũ hỗ trợ.',
  });
}

export function createPasswordResetEmailTemplate(token: string): MailTemplate {
  const resetUrl = `${getFrontendUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;

  return renderAppEmail({
    preheader: 'Yêu cầu đặt lại mật khẩu tài khoản Movie Recommendation.',
    eyebrow: 'Bảo mật',
    title: 'Đặt lại mật khẩu',
    paragraphs: [
      'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Liên kết này chỉ có hiệu lực trong thời gian giới hạn.',
    ],
    action: {
      label: 'Đặt lại mật khẩu',
      href: resetUrl,
    },
  });
}
