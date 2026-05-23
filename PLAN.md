# TweetCity — Implementation Plan
## Mantle Turing Test Hackathon 2026 | Consumer & Viral DApps Track

**Дедлайн сдачи:** 15 июня 2026  
**Demo Day:** 2–3 июля 2026  
**Призовой трек:** Consumer & Viral DApps (Animoca Minds × OpenCheck)

---

## Концепция (финальная версия)

DApp превращает Twitter-аккаунт пользователя в живой генеративный город-NFT на Mantle.
Публичные метрики аккаунта напрямую управляют визуальным состоянием города.
AI (Claude) — не вспомогательный элемент, а архитектор личности города.

### Механика метрик → город

| Twitter метрика | Что строит в городе |
|----------------|---------------------|
| Followers | Население (плотность и тип жилых зданий) |
| Tweet Count | Инфраструктура (дороги, мосты, общественные здания) |
| Following Count | Торговые маршруты (визуальные связи с другими городами) |
| Likes + Retweets | Культура (парки, статуи, фонтаны) |

### Уровни города

| Уровень | Название | Followers |
|---------|----------|-----------|
| 1 | Village | 0–100 |
| 2 | Town | 100–1 000 |
| 3 | City | 1 000–10 000 |
| 4 | Metropolis | 10 000–100 000 |
| 5 | Megacity | 100 000+ |

---

## AI как центральный элемент (не вспомогательный)

Это главное отличие от конкурентов. AI делает каждый город уникальным.

### MVP (обязательно при минте, сохраняется в IPFS):

1. **Архитектурный стиль** — анализирует последние 50 твитов, определяет стиль:
   `Cyberpunk | Eco-Futurism | Medieval | Brutalist | Minimalist | Baroque | Bio-Punk`

2. **Имя и девиз города** — уникальное название + латинский девиз.
   Пример: *"Nova Synthetika — Per Codem Ad Astra"*

3. **Лор города** — 2-3 предложения в стиле фэнтезийного атласа.

4. **Цветовая палитра** — 3 hex-цвета, подобранных под стиль и тематику твитов.

### Full Scope (опционально, можно показать как "coming soon" в демо):

5. **Mayor's Newsletter** — AI-дайджест из твитов, как городская газета. При каждом level-up.

6. **Seasonal Events** — если engagement за неделю вырос на 50%+, AI объявляет праздник
   с временными визуальными эффектами.

---

## Технический стек (финальный)

| Слой | Технология | Почему |
|------|------------|--------|
| Blockchain | Mantle Network Testnet | Условие хакатона, дешёвый газ |
| Smart Contract | Solidity 0.8.24 + Hardhat | ERC-721 dynamic NFT |
| Twitter Data | **Twikit** (Python scraper) + `ITwitterProvider` интерфейс | Free API не даёт читать чужие метрики; Twikit — бесплатно |
| Twitter fallback | Apify Twitter Scraper (~$5/1000 результатов) | Если Twikit сломается к Demo Day |
| AI | Claude API (`claude-haiku-4-5-20251001` для стиля + `claude-sonnet-4-6` для лора) | Актуальные модели, лучше в нарративах |
| Frontend | React + ethers.js | Стандарт |
| City Render | Generative SVG/Canvas (pure JS) | Нет внешнего хранилища |
| Metadata | IPFS (Pinata) только при level-up + on-chain snapshots | Экономия Pinata free tier (500 req/мес) |
| Backend | Node.js + Express (оракул) + Python микросервис (Twikit) | Node для контракта, Python для скрапинга |
| Deploy | Vercel (frontend) + Railway (Node backend + Python scraper) | Бесплатно |

> **Почему не Twitter API v2 Free Tier:** бесплатный тир даёт только 500 твитов/мес на **запись**.
> Чтение `public_metrics` требует Basic ($200/мес). Twikit — бесплатный Python-скрапер Twitter.

---

## Архитектура системы

```
Tweet Proof → Node Backend → Python Twikit Scraper → Twitter (scraping)
                  ↓                                          ↓
           Smart Contract (Mantle)                    метрики + твиты
                  ↓                                          ↓
           IPFS (только level-up)              Claude API (стиль/лор/имя)
                  ↓
          React Frontend (SVG City Renderer)
```

### Поток "Mint City":
1. Пользователь подключает кошелёк (MetaMask / Mantle Testnet)
2. Вводит свой Twitter handle
3. **Tweet Proof:** сайт генерирует уникальный текст `TweetCity verify: <walletAddress> #TweetCity`
4. Пользователь постит твит с этим текстом
5. Backend проверяет наличие твита через Twikit → подтверждение владения аккаунтом
6. Twikit тянет метрики (followers, tweets, following, engagement) + последние 50 твитов
7. Claude анализирует твиты → стиль, имя, девиз, лор
8. Metadata JSON загружается в IPFS (Pinata)
9. `mintCity(...)` вызывается на контракте oracle-кошельком
10. NFT заминчен, город отображается

### Поток "Sync City" (обновление):
1. Пользователь нажимает "Sync City" (не чаще 1 раза в час)
2. Backend тянет свежие метрики через Twikit
3. Если уровень **не** изменился → `updateCity(..., ipfsCID: "")` — IPFS не трогаем
4. Если уровень вырос → Claude генерирует upgrade-нарратив, новый JSON в IPFS → `updateCity(..., newIpfsCID)`
5. Frontend перерисовывает город с анимацией апгрейда

---

## MVP vs. Full Scope

### MVP (обязательно к Demo Day)
- [x] Mint city NFT по Twitter handle
- [x] Базовая SVG визуализация (4 уровня, 3 архитектурных стиля)
- [x] Claude генерирует имя + стиль + краткий лор
- [x] On-chain хранение metrics snapshot
- [x] "Sync City" обновление метрик
- [x] Shareable screenshot + pre-formatted X post
- [x] Leaderboard (топ-10 городов)

### Full Scope (если успеем)
- [ ] Mayor's Newsletter (еженедельный AI дайджест)
- [ ] Neighbor Visits + on-chain лайки
- [ ] Seasonal Events при engagement spike
- [ ] Trade Routes между городами
- [ ] 7 архитектурных стилей вместо 3
- [ ] Animated upgrade effects (CSS/Canvas)

---

## Фазы реализации

### Фаза 0 — Окружение и архитектура (День 1–2)

**Цель:** всё настроено, можно писать код.

- [ ] Инициализировать Hardhat проект: `npx hardhat init`
- [ ] Настроить Mantle Testnet в `hardhat.config.js` (chainId: 5003, RPC: https://rpc.sepolia.mantle.xyz)
- [ ] Получить тестовые MNT из фосета Mantle Sepolia
- [ ] Создать React приложение: `npx create-react-app tweetcity-frontend`
- [ ] Создать Node.js backend: `npm init` + Express
- [ ] Настроить Twitter Developer App: OAuth 2.0, получить credentials
- [ ] Настроить Claude API ключ (Anthropic Console)
- [ ] Создать IPFS аккаунт (Pinata — бесплатный tier)
- [ ] Настроить MetaMask для Mantle Testnet

**Проверка:** `npx hardhat compile` проходит, MetaMask подключается к Mantle Testnet.

---

### Фаза 1 — Smart Contract (День 3–5)

**Цель:** задеплоенный и проверенный контракт на Mantle Testnet.

#### Файл: `contracts/TweetCity.sol` — ключевые решения

- `pragma solidity ^0.8.24` + `evmVersion: "cancun"` (для совместимости с OpenZeppelin latest)
- `updateCity(..., ipfsCID: "")` — пустой CID = не обновлять IPFS (экономия Pinata)
- `likeCity()` — требует `balanceOf(msg.sender) > 0` (anti-spam: лайкать могут только владельцы городов)
- Level 5 (Megacity) хранится в контракте, визуально = Metropolis + frontend-аура

- [x] Написать контракт TweetCity.sol ✅
- [x] Написать тесты: `test/TweetCity.test.js` — **32/32 зелёных** ✅
- [x] Написать deploy script: `scripts/deploy.js` ✅
- [ ] Задеплоить на Mantle Testnet: `npx hardhat run scripts/deploy.js --network mantleTestnet`
- [ ] Верифицировать контракт на Mantle Testnet Explorer

**Проверка:** контракт задеплоен, mint через Hardhat console работает, история снапшотов хранится.

---

### Фаза 2 — Backend Oracle (День 6–8)

**Цель:** сервер принимает запросы от фронта, тянет данные Twitter через Twikit, вызывает контракт.

#### API роуты (`backend/src/routes/city.js`):

```
POST /api/verify-tweet
  - принимает: { walletAddress, twitterHandle }
  - возвращает: { verifyText: "TweetCity verify: 0x... #TweetCity" }

POST /api/mint
  - принимает: { walletAddress, twitterHandle }
  - Twikit проверяет наличие verify-твита (Tweet Proof)
  - Twikit тянет метрики + последние 50 твитов
  - Claude генерирует стиль/имя/лор
  - Pinata загружает metadata JSON
  - mintCity() на контракте (oracle wallet)
  - возвращает: { tokenId, cityData, ipfsCID }

POST /api/sync
  - принимает: { tokenId, twitterHandle }
  - Twikit тянет свежие метрики
  - Если level-up → Claude + Pinata + updateCity(newCID)
  - Если нет level-up → updateCity("") — IPFS не трогаем
  - возвращает: { updated: bool, levelUp: bool, newMetrics }

GET /api/city/:tokenId    — данные из контракта
GET /api/leaderboard      — топ-10 городов по followers
```

#### ITwitterProvider интерфейс (для переключения провайдеров):
```javascript
// backend/src/services/twitter/ITwitterProvider.js
class ITwitterProvider {
  async getUserMetrics(handle) { /* { followers, tweetCount, following } */ }
  async getUserTweets(handle, count) { /* [{ text, likes, retweets }] */ }
  async findTweet(handle, searchText) { /* tweet | null */ }
}

// backend/src/services/twitter/TwikitProvider.js  — основной
// backend/src/services/twitter/ApifyProvider.js   — fallback
```

- [ ] Создать `backend/` Node.js + Express
- [ ] Создать Python микросервис `twitter-scraper/` с Twikit
- [ ] Реализовать `ITwitterProvider` + `TwikitProvider` + `ApifyProvider`
- [ ] Реализовать Tweet Proof верификацию
- [ ] Реализовать Pinata IPFS upload (только при level-up)
- [ ] Реализовать oracle wallet для вызова контракта
- [ ] Rate limiting: не более 1 sync в час на tokenId
- [ ] Cooldown кеш: хранить метрики 1 час в памяти (Redis или простой Map)

**Проверка:** POST /api/mint с реальным handle → NFT заминчен на Mantle Testnet.

---

### Фаза 3 — Claude AI Integration (День 7–9, параллельно с Фазой 2)

**Цель:** Claude — главный персонаж, не фича в скобках.

#### Файл: `backend/src/services/claude.js`

```javascript
async function analyzeCityPersonality(tweets, metrics) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",  // быстро и дёшево
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are an AI urban architect. Analyze these ${tweets.length} tweets and metrics to design a unique city.

METRICS:
- Followers: ${metrics.followers}
- Tweets: ${metrics.tweetCount}
- Following: ${metrics.following}
- Engagement rate: ${metrics.engagementRate}%

RECENT TWEETS (last 50):
${tweets.map(t => t.text).join('\n')}

Return JSON with:
{
  "style": "Cyberpunk|Eco-Futurism|Medieval|Brutalist|Minimalist|Baroque|Bio-Punk",
  "cityName": "unique city name (2-3 words)",
  "motto": "latin city motto",
  "lore": "2-3 sentences city history in fantasy atlas style",
  "dominantThemes": ["theme1", "theme2"],
  "colorPalette": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex"
  }
}`
    }]
  });
  return JSON.parse(response.content[0].text);
}

async function generateMayorsNewsletter(tweets, cityName, currentMetrics) {
  // claude-sonnet-4-6 для качественного нарратива
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Write a short "Mayor's Newsletter" for ${cityName} based on recent activity.
Format: 3-4 sentences, written as a fantasy city mayor's announcement.
Recent tweets context: ${tweets.slice(0, 10).map(t => t.text).join(' | ')}
Current population (followers): ${currentMetrics.followers}`
    }]
  });
  return response.content[0].text;
}
```

**MVP (обязательно):**
- [ ] Реализовать `analyzeCityPersonality()` — стиль + имя + девиз + лор + палитра (`claude-haiku-4-5-20251001`)
- [ ] Добавить prompt caching для системного промпта (снижение стоимости на 90%)
- [ ] Сохранять AI-результат в IPFS metadata при минте

**Full Scope (опционально):**
- [ ] Реализовать `generateMayorsNewsletter()` — нарратив при level-up (`claude-sonnet-4-6`)
- [ ] Реализовать `detectSeasonalEvent()` — engagement spike → праздник

**Проверка:** при тестовом mint Claude возвращает валидный JSON с уникальным именем города и цветовой палитрой.

---

### Фаза 4 — SVG City Renderer (День 8–12)

**Цель:** красивый, уникальный, генеративный город в браузере без внешних зависимостей.

#### Архитектура рендерера: `frontend/src/components/CityRenderer/`

```
CityRenderer/
  index.jsx          — основной компонент, принимает props
  layers/
    Background.js    — небо, горизонт, атмосфера (зависит от стиля)
    Ground.js        — земля, дороги (зависит от tweetCount)
    Buildings.js     — здания (зависит от followers + стиль)
    Culture.js       — парки, статуи (зависит от engagement)
    Overlay.js       — погода, события (seasonal events)
  styles/
    cyberpunk.js     — цвета и формы для Cyberpunk
    ecoFuturism.js   — цвета и формы для Eco-Futurism
    medieval.js      — цвета и формы для Medieval
    ... (7 стилей)
  utils/
    seededRandom.js  — детерминированный PRNG (seed = tokenId)
    svgHelpers.js    — утилиты для генерации SVG path
```

#### Принцип генерации (детерминированность):
```javascript
// Одинаковый tokenId → всегда одинаковый город
// Изменились метрики → город вырос, но остался узнаваемым
const seed = tokenId * 1000 + metrics.followers;
const rng = seededRandom(seed);

// Количество зданий = f(followers)
const buildingCount = Math.floor(metrics.followers / 10) + levelBase[metrics.level];
```

#### Уровни детализации SVG:
- **Village (1):** 3-7 зданий, грунтовая дорога, 1 фонтан
- **Town (2):** 8-20 зданий, мощёные дороги, парк
- **City (3):** 21-60 зданий, развязки, несколько кварталов
- **Metropolis (4):** 60-150 зданий, небоскрёбы, транспортные узлы
- **Megacity (5):** визуально = Metropolis + легендарная аура (glow-эффект, частицы, уникальный цвет неба)
  → экономит 2-3 дня разработки SVG, выглядит как легендарный тир

- [ ] Реализовать `seededRandom.js` (mulberry32 алгоритм)
- [ ] Реализовать `Background.js` — небо по стилю
- [ ] Реализовать `Buildings.js` — основной генератор (приоритет)
- [ ] Реализовать `Ground.js` — дороги и инфраструктура
- [ ] Реализовать `Culture.js` — культурные элементы
- [ ] Реализовать 3 стиля для MVP: Cyberpunk, Medieval, Eco-Futurism
- [ ] `<CityRenderer>` компонент принимает `{ metrics, style, colorPalette, tokenId }`
- [ ] Кнопка "Export PNG" через `canvas.toDataURL()` для share механики

**Проверка:** три разных tokenId с одинаковыми метриками → три разных, но стабильных города. Один и тот же tokenId → всегда одинаковый результат.

---

### Фаза 5 — Frontend DApp (День 10–14)

**Цель:** рабочий DApp, подключённый к контракту и бекенду.

#### Страницы:

```
/ (Home)              — hero + Connect Wallet + Mint My City
/city/:tokenId        — страница города (SVG + метрики + Mayor's Newsletter)
/leaderboard          — топ городов по уровню/followers
/explore              — поиск города по Twitter handle
```

#### Компоненты:
- `WalletConnect` — MetaMask + Mantle Testnet автоподключение
- `TwitterOAuth` — кнопка "Connect Twitter"
- `MintFlow` — степпер: Connect → Authorize → Preview → Mint
- `CityDashboard` — главный вид города + история роста (chart)
- `SyncButton` — "Sync City" + индикатор изменений
- `ShareCard` — генерация screenshot + pre-formatted X post
- `Leaderboard` — таблица топ-10

- [ ] Настроить wagmi/viem для Mantle Testnet
- [ ] Реализовать Mint Flow (3-шаговый wizard)
- [ ] Реализовать City Dashboard с историей (recharts)
- [ ] Реализовать Share Card (html-to-image библиотека)
- [ ] Реализовать Leaderboard (данные из контракта events)
- [ ] Реализовать Explore (поиск по handle)
- [ ] Адаптивный дизайн (мобильный + десктоп)

**Проверка:** полный флоу mint → view → sync работает на Mantle Testnet. Share генерирует корректный скриншот.

---

### Фаза 6 — Вирусная механика (День 13–15)

**Цель:** механики, которые создают органический рост.

- [ ] **Tweet Proof (единственный механизм верификации):** генерировать `TweetCity verify: <wallet> #TweetCity`, Twikit проверяет наличие твита → подтверждение владения аккаунтом + виральный охват
- [ ] **Share My City:** кнопка генерирует branded PNG + текст "My Twitter is now a living city! 🏙️ Claim yours at tweetcity.xyz #TweetCity #MantleAI"
- [ ] **Leaderboard OG:** публичная страница лидерборда с красивым дизайном для распространения
- [ ] **On-chain Likes:** интеграция `likeCity()` контракта с UI (анимация при лайке)
- [ ] **Level-up Notification:** toast с анимацией при повышении уровня

---

### Фаза 7 — Deploy и Demo Prep (День 15–16)

- [ ] Deploy frontend на Vercel
- [ ] Deploy backend на Railway (или Render)
- [ ] Финальный деплой контракта (если нужен новый адрес)
- [ ] Smoke test полного флоу на продакшене
- [ ] Записать 3-минутное demo video
- [ ] Написать GitHub README (архитектура, как запустить, контракт адрес)
- [ ] Подготовить X thread: pitch + demo video + GitHub + Mantle contract address + #MantleAIHackathon

---

## Структура репозитория

```
tweetcity/
├── contracts/
│   ├── TweetCity.sol
│   └── test/TweetCity.test.js
├── scripts/
│   └── deploy.js
├── hardhat.config.js
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── city.js
│   │   ├── services/
│   │   │   ├── claude.js
│   │   │   ├── twitter.js
│   │   │   ├── ipfs.js
│   │   │   └── contract.js
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CityRenderer/
│   │   │   ├── WalletConnect/
│   │   │   ├── MintFlow/
│   │   │   └── ShareCard/
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── City.jsx
│   │   │   └── Leaderboard.jsx
│   │   └── App.jsx
│   └── package.json
└── README.md
```

---

## Переменные окружения

```env
# backend/.env
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_CALLBACK_URL=https://api.tweetcity.xyz/auth/twitter/callback

ANTHROPIC_API_KEY=

PINATA_API_KEY=
PINATA_SECRET_KEY=

ORACLE_PRIVATE_KEY=        # кошелёк-оракул для вызова контракта
MANTLE_TESTNET_RPC=https://rpc.sepolia.mantle.xyz
CONTRACT_ADDRESS=

# frontend/.env
REACT_APP_CONTRACT_ADDRESS=
REACT_APP_MANTLE_RPC=https://rpc.sepolia.mantle.xyz
REACT_APP_BACKEND_URL=https://api.tweetcity.xyz
```

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Twikit сломается до Demo Day | Средняя | `ITwitterProvider` позволяет переключить на Apify за 5 минут |
| Pinata free tier (500 req/мес) исчерпан | Низкая | IPFS только при level-up → ~50 req на 50 юзеров |
| SVG город выглядит плохо | Средняя | Минимум 3 полностью готовых стиля для демо |
| Claude возвращает не-JSON | Низкая | Парсить с fallback на дефолтные значения |
| Twikit банит аккаунт-скрапер | Средняя | Использовать отдельный Twitter-аккаунт для Twikit, ротация |
| Mantle Testnet нестабилен | Низкая | Держать fallback RPC (несколько эндпоинтов) |
| Demo day: нет реальных юзеров | Высокая | Заранее заминтить 5-10 тестовых городов разных уровней |

---

## Критерии победы в треке Consumer & Viral

Animoca Minds оценивает:
1. **Viral potential** — есть ли механика органического распространения? ✅ Share My City + Leaderboard
2. **Consumer onboarding** — прост ли вход для Web2 юзера? ✅ Twitter OAuth скрывает Web3 сложность
3. **AI integration** — реально ли AI влияет на продукт? ✅ Claude как архитектор личности города
4. **On-chain verifiability** — что именно на блокчейне? ✅ Metric snapshots, лайки, история роста
5. **Working demo** — работает ли live? → наша задача к Demo Day

---

## Сроки (ориентировочно от старта)

| Фаза | Дни | Готово |
|------|-----|--------|
| 0: Setup | 1-2 | — |
| 1: Smart Contract | 3-5 | — |
| 2: Backend Oracle | 6-8 | — |
| 3: Claude AI | 7-9 | — |
| 4: SVG Renderer | 8-12 | — |
| 5: Frontend DApp | 10-14 | — |
| 6: Viral Mechanics | 13-15 | — |
| 7: Deploy & Demo | 15-16 | — |

**Итого:** ~16 рабочих дней. Дедлайн June 15 — достижимо.
