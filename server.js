const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: 'https://disciplaner.ru' }));
app.use(express.json());

// ==== YooKassa ====
const SHOP_ID = '1130054';
const API_KEY = 'test_rA7JLcGVkI5QbiihyIkMKOr5CZUN5KjxmFglqWCdyb4';

// ==== Продукты ====
const productLinks = {
  product1: 'https://disciplaner.ru/files/tracker1.xlsx',
  product2: 'https://disciplaner.ru/files/tracker2.xlsx',
  product3: 'https://disciplaner.ru/files/tracker3.xlsx'
};

// Временное хранилище платежей
const payments = {};

// ==== SMTP.bz транспорт ====
const transporter = nodemailer.createTransport({
  host: 'connect.smtp.bz',
  port: 465, // SSL
  secure: true,
  auth: {
    user: 'shamilgaliev20@mail.ru',
    pass: 'W9oSJSNXMEvE '
  }
});

// ==== 1. Создание платежа ====
app.post('/create-payment', async (req, res) => {
  const idempotenceKey = uuidv4();
  const { amount, email, items } = req.body;

  if (!email || !items || items.length === 0) {
    return res.status(400).json({ error: 'Email и товары обязательны' });
  }

  try {
    const response = await axios.post(
      'https://api.yookassa.ru/v3/payments',
      {
        amount: { value: amount, currency: 'RUB' },
        confirmation: {
          type: 'redirect',
          return_url: 'https://disciplaner.ru/success'
        },
        capture: true,
        description: `Покупка Disciplaner (${items.join(', ')})`
      },
      {
        headers: {
          'Idempotence-Key': idempotenceKey,
          'Authorization': 'Basic ' + Buffer.from(`${SHOP_ID}:${API_KEY}`).toString('base64'),
          'Content-Type': 'application/json'
        }
      }
    );

    // Сохраняем данные платежа
    const paymentId = response.data.id;
    payments[paymentId] = { email, items };

    console.log(`💾 Сохранён платеж ${paymentId} для ${email}, товары: ${items.join(', ')}`);

    res.json({ confirmation_url: response.data.confirmation.confirmation_url });
  } catch (err) {
    console.error('Ошибка создания платежа:', err.response?.data || err.message);
    res.status(500).send('Ошибка оплаты');
  }
});

// ==== 2. Webhook YooKassa ====
app.post('/yookassa-webhook', express.json(), async (req, res) => {
  const event = req.body;
  console.log('Webhook от YooKassa:', JSON.stringify(event, null, 2));

  if (event.event === 'payment.succeeded') {
    const paymentId = event.object.id;
    const paymentData = payments[paymentId];

    if (paymentData) {
      const { email, items } = paymentData;

      // Собираем ссылки для купленных товаров
      const selectedLinks = items.map(item => productLinks[item]).filter(Boolean);
      const messageText = `Спасибо за оплату!\nВаши ссылки:\n${selectedLinks.join('\n')}`;

      try {
        await transporter.sendMail({
          from: '"Disciplaner" <info@disciplaner.ru>',
          to: email,
          subject: 'Ваши ссылки на продукты Disciplaner',
          text: messageText
        });
        console.log(`✅ Ссылки отправлены на ${email}`);
      } catch (err) {
        console.error(`❌ Ошибка отправки письма: ${err.message}`);
      }
    } else {
      console.warn(`⚠ Нет данных о платеже ${paymentId} в памяти`);
    }
  }

  res.sendStatus(200);
});

// ==== 3. Запуск сервера ====
app.listen(3000, () => console.log('🚀 Сервер работает на http://localhost:3000'));
