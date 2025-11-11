import express from "express";

const app = express();

app.all("/", (req, res) => {
  res.send("Bot is running!");
});

function keepAlive() {
  app.listen(3000, () => {
    console.log("✅ Keep-alive server aktif");
  });
}

export default keepAlive;
