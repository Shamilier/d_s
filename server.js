const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(cors({
  origin: 'http://disciplaner.ru' 
}));
app.use(express.json());

const SHOP_ID = '1130054';
const API_KEY = 'test_rA7JLcGVkI5QbiihyIkMKOr5CZUN5KjxmFglqWCdyb4';

app.post('/create-payment', async (req, res) => {
  const idempotenceKey = uuidv4();
  const amount = req.body.amount || '1490.00';

  try {
    const response = await axios.post(
      'https://api.yookassa.ru/v3/payments',
      {
        amount: { value: amount, currency: 'RUB' },
        confirmation: {
          type: 'redirect',
          return_url: 'https://discipliner.ru/success'
        },
        capture: true,
        description: 'Покупка Disciplaner'
      },
      {
        headers: {
          'Idempotence-Key': idempotenceKey,
          'Authorization': 'Basic ' + Buffer.from(`${SHOP_ID}:${API_KEY}`).toString('base64'),
          'Content-Type': 'application/json'
        }
      }
    );
    res.json({ confirmation_url: response.data.confirmation.confirmation_url });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Ошибка оплаты');
  }
});

app.listen(3000, () => console.log('Сервер работает на http://localhost:3000'));
