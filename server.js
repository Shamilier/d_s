const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({ origin: 'https://disciplaner.ru' }));
app.use(express.json());

// ==== YooKassa ====
// ==== YooKassa ====
const SHOP_ID = process.env.SHOP_ID;
const API_KEY = process.env.API_KEY;

// ==== Продукты ====
const productLinks = {
  product1: 'https://docs.google.com/spreadsheets/d/1TFDy9c4LjhRGz295WhIAhENbkGUCamH-9fhclelO8Oo/edit?usp=sharing',
  product2: 'https://docs.google.com/spreadsheets/d/1iJ4GeokUGW3Gc5OW7tH06aL38qhaY0oZGNNEBiAIEbk/edit?usp=sharing ',
  product3: 'https://docs.google.com/spreadsheets/d/1yQ6lnEbe3x30x_fHLCp4CH9fRbjME8UK1g8u-_PVrd4/edit?usp=sharing'
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

app.get('/test-email', async (req, res) => {
  try {
    await transporter.sendMail({
      from: '"Disciplaner" <info@disciplaner.ru>',
      to: 'Shamilgaliev18@mail.ru', // сюда укажи адрес, куда хочешь отправить тест
      subject: 'Тестовое письмо Disciplaner',
      text: 'Это тестовое письмо для проверки SMTP.bz'
    });
    res.send('✅ Письмо отправлено');
  } catch (err) {
    console.error('❌ Ошибка отправки:', err.message);
    res.status(500).send('Ошибка отправки: ' + err.message);
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
      description: `Покупка Disciplaner (${items.join(', ')})`,
  
      receipt: {
        customer: {
          email: email // Email покупателя из формы
        },
        items: items.map(item => ({
          description: `Disciplaner: ${item}`,
          quantity: 1,
          amount: { value: amount, currency: 'RUB' },
          vat_code: 1 // 1 = Без НДС
        }))
      }
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
