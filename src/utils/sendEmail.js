import nodemailer from "nodemailer";

const sendEmail = async ({ to, subject, text }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Missing email configuration. Set EMAIL_USER and EMAIL_PASS.");
  }

  if (!to) {
    throw new Error("Missing recipient email address.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"MaxMethod" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent to:", to, info.messageId ? `(${info.messageId})` : "");
    return info;
  } catch (err) {
    console.error(`Email error for ${to}:`, err.message);
    throw err;
  }
};

export default sendEmail;
