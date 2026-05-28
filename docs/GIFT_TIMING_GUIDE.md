# Gift Timing Configuration

Quick reference for tuning the two time windows on the CityGifts contract
without redeploying.

## Контракт и доступ

| Параметр | Значение |
|---|---|
| **CityGifts proxy** | `0x1F672C3da27a50261524dAbb0FF957f49202c3F3` |
| **Сеть** | Mantle Sepolia Testnet (chainId 5003) |
| **Кто может менять** | Owner контракта = deployer кошелёк `0x5F78...891D` |
| **Explorer Write UI** | https://sepolia.mantlescan.xyz/address/0x1F672C3da27a50261524dAbb0FF957f49202c3F3#writeProxyContract |

Тип контракта — UUPS proxy. Любые изменения параметров применяются мгновенно
ко всем НОВЫМ гифтам. Уже отправленные гифты сохраняют свои дедлайны
(они зашиты в `acceptDeadline` / `engageDeadline` при `sendGift`/`approveGift`).

---

## 1. Accept Window

**Что это:** сколько времени у владельца города есть на нажатие Accept или
Reject после того как кто-то отправил pending-гифт.

**Текущее значение:** 24 часа (86400 секунд).

**Функция:** `setAcceptWindow(uint64 newWindow)` — одно окно общее для всех 6 типов.

### Как изменить через explorer

1. Открыть страницу `Write Proxy` контракта (ссылка выше).
2. Connect Wallet → выбрать deployer-кошелёк (`0x5F78...891D`).
3. Найти функцию **`setAcceptWindow`**.
4. В поле `newWindow (uint64)` ввести значение **в секундах**.
5. Write → Confirm в MetaMask.

### Шпаргалка по значениям

| Желаемое окно | Секунды |
|---|---|
| 30 минут | `1800` |
| 1 час | `3600` |
| 6 часов | `21600` |
| 12 часов | `43200` |
| 24 часа (текущее) | `86400` |
| 48 часов | `172800` |
| 72 часа | `259200` |

---

## 2. Engage Windows

**Что это:** сколько у владельца есть на выполнение обещанного действия в
Twitter ПОСЛЕ нажатия Accept (лайкнуть/ретвитнуть/закрепить и т.д.). Если
не уложился — покупатель забирает refund через `claimExpired`.

**Текущее значение:** 48 часов (172800 секунд) — для каждого из 6 типов.

**Функция:** `setEngageWindow(uint8 giftType, uint64 newWindow)` — у каждого
типа своё окно, поэтому вызвать нужно отдельно для каждого типа который
хочешь поменять.

### Маппинг типов

| giftType | Тип | Описание обязательства |
|---:|---|---|
| 0 | Graffiti | Лайк твита |
| 1 | StreetArt | Лайк + ретвит |
| 2 | Flag | Ответ на твит |
| 3 | Billboard | Quote-tweet |
| 4 | Monument | Отдельный пост с упоминанием |
| 5 | District | Закрепить твит на 7 дней |

### Как изменить через explorer

1. Открыть `Write Proxy` страницу.
2. Connect Wallet (`0x5F78...891D`).
3. Найти функцию **`setEngageWindow`**.
4. Два поля:
   - `giftType (uint8)` — номер типа от 0 до 5
   - `newWindow (uint64)` — секунды
5. Write → Confirm. Повторить для остальных типов.

### Пример: 1 час для всех типов

Повторить 6 раз с разными `giftType`:

| giftType | newWindow |
|---:|---|
| 0 | 3600 |
| 1 | 3600 |
| 2 | 3600 |
| 3 | 3600 |
| 4 | 3600 |
| 5 | 3600 |

---

## Проверка значений

В блоке **Read Proxy** на mantlescan:

- `acceptWindow()` → текущее accept window в секундах
- `engageWindows(0)` … `engageWindows(5)` → engage window для каждого типа

---

## Через Hardhat (опционально)

Если хочешь менять программно (не через UI), создай разовый скрипт:

```js
// scripts/setWindows.js
const hre = require("hardhat");
require("dotenv").config({ path: "./backend/.env" });

async function main() {
  const gifts = await hre.ethers.getContractAt(
    "CityGifts",
    process.env.GIFTS_CONTRACT_ADDRESS
  );

  await (await gifts.setAcceptWindow(3600)).wait();         // 1ч
  for (let t = 0; t < 6; t++) {
    await (await gifts.setEngageWindow(t, 3600)).wait();    // 1ч на тип
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Запуск:
```
npx hardhat run scripts/setWindows.js --network mantleTestnet
```

---

## Восстановление дефолтов

Production значения которые стояли на момент деплоя (24ч / 48ч):

| Функция | Значение |
|---|---|
| `setAcceptWindow(86400)` | 24ч |
| `setEngageWindow(0..5, 172800)` | 48ч для каждого типа |
