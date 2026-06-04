const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'kyawwaiyannaing37@gmail.com',
    pass: 'eaomhnkqjznweute'
  }
});

async function sendVerificationEmail(userEmail, verificationCode) {
  const mailOptions = {
    from: '"Kael-Freelance Core" <kyawwaiyannaing37@gmail.com>',
    to: userEmail,
    subject: 'Verify Your Email - Kael-Freelance Core',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #6c5ce7;">Welcome to Kael!</h2>
        <p>Please use the verification code below:</p>
        <div style="background: #f0f0f5; padding: 20px; text-align: center; font-size: 28px; letter-spacing: 5px; font-weight: bold; color: #6c5ce7;">${verificationCode}</div>
        <p style="margin-top: 20px; font-size: 0.9em;">This code expires in 10 minutes.</p>
      </div>
    `
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Email send error:', error.message);
    throw error;
  }
}

async function sendPreRegisterConfirmation(userEmail, userName) {
  const mailOptions = {
    from: '"Kael-Freelance Core" <kyawwaiyannaing37@gmail.com>',
    to: userEmail,
    subject: '✅ Pre-Registration Confirmed – Kael-Freelance Core',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; background: #111118; color: #f0f0f5; padding: 30px; border-radius: 14px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6c5ce7; margin: 0;">Kael-Freelance Core</h1>
          <p style="color: #7a7a90;">Myanmar's First Freelance Platform</p>
        </div>
        <h2 style="color: #00d4aa;">✅ Pre-Registration Confirmed!</h2>
        <p>Dear <strong>${userName}</strong>,</p>
        <p>Thank you for pre-registering! You'll get <strong>20 Days of 0% Commission</strong> starting July 15, 2026.</p>
        <div style="background: #1a1a25; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h3 style="color: #f5a623;">🎁 Your Benefits:</h3>
          <ul style="color: #b0b0c0;">
            <li>✅ 20 Days 0% Commission</li>
            <li>✅ Zero Hidden Fees</li>
            <li>✅ Priority Support</li>
            <li>✅ Early Access Badge</li>
          </ul>
        </div>
        <p style="color: #f5a623; font-weight: 600;">🚀 Launch Date: July 15, 2026</p>
      </div>
    `
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Pre-registration confirmation sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Email send error:', error.message);
    throw error;
  }
}

module.exports = { sendVerificationEmail, sendPreRegisterConfirmation };
