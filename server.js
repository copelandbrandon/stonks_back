const Express = require("express");
const App = Express();
const BodyParser = require("body-parser");
const PORT = 8080;
require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const WebSocket = require("ws");

//Database connection configuration
const { Pool } = require("pg");
const dbParams = require("./lib/db.js");
const db = new Pool(dbParams);
// console.log(dbParams)
db.connect();

let socket = new WebSocket(`wss://ws.finnhub.io?token=${process.env.API_KEY}`);

// socket.addEventListener('open', function (event) {
//   socket.send(JSON.stringify({'type':'subscribe', 'symbol': 'GOOG'}))
//   socket.send(JSON.stringify({'type':'subscribe', 'symbol': 'AAPL'}))
//   socket.send(JSON.stringify({'type':'subscribe', 'symbol': 'IC MARKETS:1'}))
// });

// // Listen for messages
// socket.addEventListener('message', function (event) {
//   console.log('Message from server ', event.data);
// });

// Express Configuration
App.use(BodyParser.urlencoded({ extended: false }));
App.use(BodyParser.json());
App.use(Express.static("public"));

//DATABASE AND JSON REQUESTS
// Get Route for current logged in user
App.get("/api/users", (req, res) => {
  db.query(`SELECT * FROM users WHERE id=1;`)
    .then((data) => {
      const users = data.rows;
      res.json({ users });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});
//Gets users owned stocks
App.get("/api/owned-stocks", (req, res) => {
  db.query(`SELECT * FROM owned WHERE user_id=1`)
    .then((data) => {
      const owned = data.rows;
      res.json({ owned });
    })
    .catch((err) => {
      console.log(err);
    });
});
//Get route for transactions for logged in user
App.get("/api/transactions", (req, res) => {
  db.query(`SELECT * FROM transactions WHERE user_id=1;`)
    .then((data) => {
      const transactions = data.rows;
      res.json({ transactions });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});
//Get route for current logged in user tutorial history
App.get("/api/tutorials", (req, res) => {
  db.query(`SELECT * FROM tutorials WHERE user_id=1;`)
    .then((data) => {
      const tutorials = data.rows;
      res.json({ tutorials });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});
//Get route for entire stock list
App.get("/api/all-stocks", (req, res) => {
  let allstocks = fs.readFileSync("nyse_full_tickers.json");
  let stocks = JSON.parse(allstocks);

  //Seperates the unregistered stocks
  stocks.forEach((stock, index) => {
    if (stock.symbol.includes("^")) {
      stocks.splice(index, 1);
    }
  });
  res.json({ stocks });
});
//Post route for buying a stock
App.post(`/api/buy-stock`, (req, res) => {
  const obj = req.body;
  return db
    .query(
      `INSERT INTO transactions (user_id, cost, shares, type, symbol)
  VALUES(1, ${obj.cost}, ${obj.amount}, ${obj.type}, '${obj.symbol}');`
    )
    .then(() => {
      return db
        .query(
          `SELECT * FROM owned WHERE user_id = 1 AND symbol = '${obj.symbol}';`
        )
        .then((data) => {
          if (data.rows.length === 0) {
            return db.query(
              `INSERT INTO owned (user_id, symbol, amount) VALUES(1, '${obj.symbol}', ${obj.amount});`
            );
          } else {
            return db.query(
              `UPDATE owned SET amount = ${
                parseFloat(obj.amount) + parseFloat(data.rows[0].amount)
              } WHERE symbol = '${obj.symbol}' AND user_id = 1`
            );
          }
        })
        .then(() => {
          return db
            .query(`SELECT * FROM users WHERE id = 1;`)
            .then((data) => {
              return db.query(
                `UPDATE users SET balance = ${
                  parseFloat(data.rows[0].balance) -
                  parseFloat(obj.amount) * parseFloat(obj.cost)
                } WHERE id = 1;`
              );
            })
            .then(() => {
              res.json({ completed: true });
            });
        });
    });
});
//Post route for selling a stock
App.post(`/api/sell-stock`, (req, res) => {
  const obj = req.body;
  let finalAmount;
  return db
    .query(
      `INSERT INTO transactions (user_id, cost, shares, type, symbol)
  VALUES(1, ${obj.cost}, ${obj.amount}, ${obj.type}, '${obj.symbol}');`
    )
    .then(() => {
      return db
        .query(
          `SELECT * FROM owned WHERE user_id = 1 AND symbol = '${obj.symbol}';`
        )
        .then((data) => {
          finalAmount = data.rows[0].amount - obj.amount;
          if (finalAmount > 0) {
            finalAmount = obj.amount;
            return db.query(
              `UPDATE owned SET amount = ${
                parseFloat(data.rows[0].amount) - parseFloat(obj.amount)
              } WHERE symbol = '${obj.symbol}' AND user_id = 1;`
            );
          } else {
            finalAmount = parseFloat(data.rows[0].amount);
            return db.query(
              `DELETE FROM owned WHERE symbol = '${obj.symbol}' AND user_id = 1;`
            );
          }
        })
        .then(() => {
          return db.query(`SELECT * FROM users WHERE id = 1`).then((data) => {
            return db
              .query(
                `UPDATE users SET balance = ${
                  parseFloat(data.rows[0].balance) +
                  finalAmount * parseFloat(obj.cost)
                };`
              )
              .then(() => {
                res.json({ completed: true });
              });
          });
        });
    });
});
// Post request for updating completed tutorials
App.post('/api/complete-tutorial/:column', (req, res) => {
  db.query(`UPDATE tutorials SET ${req.params.column} = true WHERE user_id = 1;`).then(() => {
    db.query(`SELECT * FROM tutorials WHERE user_id = 1;`).then((data)=> {
      const tutorials = data.rows;
      res.json({ tutorials });
    })
  }).catch((err) => {
    console.log(err)
  })
})
//Get request for btc history
App.get('/api/get-btc', (req, res) => {
  let history = fs.readFileSync("btc_1month.json");
  let btc = JSON.parse(history);
  let element = btc
  res.json({element})
})

//FINNHUB API REQUESTS
//Get Route for Todays News
App.get("/api/all-news", (req, res) => {
  axios
    .get(
      `https://finnhub.io/api/v1/news?category=general&token=${process.env.API_KEY}`
    )
    .then((news) => {
      const allnews = news.data.slice(0, 10);
      res.json({ allnews });
    });
});
//Get prices for selected ticker
App.get(`/api/ticker-prices/:ticker`, (req, res) => {
  axios
    .get(
      `https://finnhub.io/api/v1/quote?symbol=${req.params.ticker}&token=${process.env.API_KEY}`
    )
    .then((prices) => {
      const allprices = prices.data;
      res.json({ allprices });
    })
    .catch((err) => {
      console.log(err);
    });
});

//COINMARKET CRYPTO API REQUESTS
//Gets all crypto
const urlc = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?CMC_PRO_API_KEY=${process.env.CRYPTO_API}`;
App.get(`/api/crypto-all`, (req, res) => {
  axios
    .get(urlc)
    .then((crypto) => {
      const allcrypto = crypto.data.data;
      res.json({ allcrypto });
    })
    .catch((err) => {
      console.log(err);
    });
});

//ALPHAVANTAGE API REQUESTS
//Get Company Data for specified ticker
App.get(`/api/company-data/:ticker`, (req, res) => {
  axios
    .get(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${req.params.ticker}&apikey=${process.env.YAHOO_KEY}`
    )
    .then((data) => {
      const companyData = data.data;
      res.json({ companyData });
    })
    .catch((err) => {
      console.log(err);
    });
});
//Get 2 year history for specific ticker
App.get(`/api/all-history/:ticker`, (req, res) => {
  axios
    .get(
      `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${req.params.ticker}&apikey=${process.env.YAHOO_KEY}`
    )
    .then((history) => {
      if (!history.data["Weekly Adjusted Time Series"]) {
        let file = JSON.parse(fs.readFileSync("all_history.json"));
        console.log("all history JSON sent")
        res.json(file);
      } else {
        resultsObj = {};
        const allhistory = history.data["Weekly Adjusted Time Series"];
        for (const [key, value] of Object.entries(allhistory)) {
          if (key.slice(0, 4) === "2019") {
            break;
          } else {
            resultsObj[key] = value;
          }
        }
        console.log("all history api triggered")
        res.json(resultsObj);
      }
    })
    .catch((err) => {
      console.log(err);
    });
});
// Get 30 day history for specific ticker
App.get(`/api/30-history/:ticker`, (req, res) => {
  axios
    .get(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${req.params.ticker}&outputsize=compact&apikey=${process.env.YAHOO_KEY}`
    )
    .then((history) => {
      if (!history.data["Time Series (Daily)"]) {
        let file = JSON.parse(fs.readFileSync('30_history.json'))
        console.log("30 day json triggered")
        res.json(file)
      } else {
        resultsObj = {};
      let index = 0;
      const allhistory = history.data["Time Series (Daily)"];
      for (const [key, value] of Object.entries(allhistory)) {
        if (index === 30) {
          break;
        } else {
          resultsObj[key] = value;
          index++;
        }
      }
      console.log("30 day api triggered")
      res.json(resultsObj);
      index = 0;
      }
    })
    .catch((err) => {
      console.log(err);
    });
});
//Get a full day resolution 5 min intervals for specific ticker
App.get(`/api/oneday-history/:ticker`, (req, res) => {
  axios
    .get(
      `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${req.params.ticker}&interval=5min&apikey=${process.env.YAHOO_KEY}`
    )
    .then((history) => {
      if (!history.data["Time Series (5min)"]) {
        let file = JSON.parse(fs.readFileSync('one_day_history.json'))
        console.log("one day json triggered")
        res.json(file)
      } else {
        console.log("one day api triggered")
        res.json(history.data["Time Series (5min)"]);
      }
    })
    .catch((err) => {
      console.log(err);
    });
});

//POLYGON.IO API REQUESTS
//News for specific ticker
App.get("/api/single-news/:ticker", (req, res) => {
  axios
    .get(
      `https://api.polygon.io/v2/reference/news?limit=10&order=descending&sort=published_utc&ticker=${req.params.ticker}&published_utc.gte=2021-04-26&apiKey=${process.env.POLY_API}`
    )
    .then((news) => {
      if (news.data.length = 0)
      {
        let cryptonews = fs.readFileSync("btc_news.json");
        let btcnews = JSON.parse(cryptonews);
        res.json(btcnews)
      } else {
        const results = news.data;
        res.json(results);
      }
    });
});

//APP LISTEN
App.listen(PORT, () => {
  console.log(
    `Express seems to be listening on port ${PORT} so that's pretty good 👍`
  );
});
