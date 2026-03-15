"""SMTP email sender – supports Send to Kindle and generic email delivery."""
import smtplib
import os
import logging
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

logger = logging.getLogger(__name__)


def send_book(
    filepath: str,
    recipient: str,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    use_tls: bool = True,
    sender_email: str | None = None,
    subject: str | None = None,
    body: str | None = None,
) -> tuple[bool, str]:
    """
    Send a book file via SMTP.

    Returns (success: bool, message: str).
    """
    path = Path(filepath)
    if not path.exists():
        return False, f"File not found: {filepath}"

    sender = sender_email or smtp_user
    subject = subject or f"Book: {path.name}"
    body = body or "Book attached. Sent via Booker."

    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    # Attach file
    with open(filepath, "rb") as f:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(f.read())
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{path.name}"')
    msg.attach(part)

    try:
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.sendmail(sender, [recipient], msg.as_string())
        server.quit()
        logger.info("Book sent to %s via %s", recipient, smtp_host)
        return True, f"Successfully sent '{path.name}' to {recipient}"
    except smtplib.SMTPAuthenticationError:
        msg_err = "SMTP authentication failed. Check username and password."
        logger.error(msg_err)
        return False, msg_err
    except smtplib.SMTPConnectError:
        msg_err = f"Could not connect to SMTP server {smtp_host}:{smtp_port}"
        logger.error(msg_err)
        return False, msg_err
    except Exception as exc:
        msg_err = f"Failed to send email: {exc}"
        logger.error(msg_err)
        return False, msg_err


def send_test_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    use_tls: bool,
    recipient: str,
    sender_email: str | None = None,
) -> tuple[bool, str]:
    """Send a test email to verify SMTP configuration."""
    sender = sender_email or smtp_user
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = "Booker – SMTP Test Email"
    msg.attach(MIMEText("This is a test email sent from Booker to verify your SMTP configuration.", "plain"))
    try:
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.sendmail(sender, [recipient], msg.as_string())
        server.quit()
        return True, f"Test email sent successfully to {recipient}"
    except smtplib.SMTPAuthenticationError:
        return False, "SMTP authentication failed. Check username and password."
    except smtplib.SMTPConnectError:
        return False, f"Could not connect to SMTP server {smtp_host}:{smtp_port}"
    except Exception as exc:
        return False, f"Failed to send test email: {exc}"


def test_smtp_connection(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    use_tls: bool = True,
) -> tuple[bool, str]:
    """Test SMTP connection without sending an email."""
    try:
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.quit()
        return True, "Connection successful"
    except Exception as exc:
        return False, str(exc)
