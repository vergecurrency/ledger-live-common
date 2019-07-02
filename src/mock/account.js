/**
 * @module mock/account
 * @flow
 */
import Prando from "prando";
import { BigNumber } from "bignumber.js";
import {
  listCryptoCurrencies,
  listTokensForCryptoCurrency
} from "../currencies";
import type {
  TokenAccount,
  Account,
  Operation,
  CryptoCurrency,
  TokenCurrency
} from "../types";
import { getOperationAmountNumber } from "../operation";
import { inferSubOperations } from "../account";
import { getDerivationScheme, runDerivationScheme } from "../derivation";

// if you use the mock, we need this
import "../load/tokens/ethereum/erc20";

function ensureNoNegative(operations) {
  let total = BigNumber(0);
  for (let i = operations.length - 1; i >= 0; i--) {
    const op = operations[i];
    const amount = getOperationAmountNumber(op);
    if (total.plus(amount).isNegative()) {
      if (op.type === "IN") {
        op.type = "OUT";
      } else if (op.type === "OUT") {
        op.type = "IN";
      }
    }
    total = total.plus(getOperationAmountNumber(op));
  }
  return total;
}

// for the mock generation we need to adjust to the actual market price of things, we want to avoid having things < 0.01 EUR
const tickerApproxMarketPrice = {
  BTC: 0.0073059,
  ETH: 5.7033e-14,
  ETC: 1.4857e-15,
  BCH: 0.0011739,
  BTG: 0.00005004,
  LTC: 0.00011728,
  XRP: 0.000057633,
  DOGE: 4.9e-9,
  DASH: 0.0003367,
  PPC: 0.000226,
  XVG: 0.00000300,
  ZEC: 0.000205798
};

// mock only use subset of cryptocurrencies to not affect tests when adding coins
const currencies = listCryptoCurrencies().filter(
  c => tickerApproxMarketPrice[c.ticker]
);

/**
 * @memberof mock/account
 */
export function genBitcoinAddressLike(rng: Prando) {
  const charset = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return `1${rng.nextString(rng.nextInt(25, 34), charset)}`;
}

/**
 * @memberof mock/account
 */
export function genHex(length: number, rng: Prando) {
  return rng.nextString(length, "0123456789ABCDEF");
}

/**
 * @memberof mock/account
 */
export function genAddress(
  currency: CryptoCurrency | TokenCurrency,
  rng: Prando
) {
  if (
    currency.type === "CryptoCurrency"
      ? currency.family === "ethereum" // all eth family
      : currency.id.startsWith("ethereum") // erc20 case
  ) {
    return `0x${genHex(40, rng)}`;
  }
  return genBitcoinAddressLike(rng);
}

// TODO fix the mock to never generate negative balance...
/**
 * @memberof mock/account
 */
export function genOperation(
  superAccount: Account,
  account: Account | TokenAccount,
  ops: *,
  rng: Prando
): $Exact<Operation> {
  const ticker =
    account.type === "TokenAccount"
      ? account.token.ticker
      : account.currency.ticker;
  const lastOp = ops[ops.length - 1];
  const date = new Date(
    (lastOp ? lastOp.date : Date.now()) -
      rng.nextInt(0, 100000000 * rng.next() * rng.next())
  );
  const address = genAddress(superAccount.currency, rng);
  const type = rng.next() < 0.3 ? "OUT" : "IN";
  const value = BigNumber(
    Math.floor(
      rng.nextInt(0, 100000 * rng.next() * rng.next()) /
        (tickerApproxMarketPrice[ticker] || tickerApproxMarketPrice.BTC)
    )
  );
  if (Number.isNaN(value)) {
    throw new Error("invalid amount generated for " + ticker);
  }
  const hash = genHex(64, rng);
  const op: $Exact<Operation> = {
    id: String(`mock_op_${ops.length}_${account.id}`),
    hash,
    type,
    value,
    fee: BigNumber(Math.round(value.toNumber() * 0.01)),
    senders: [type !== "IN" ? genAddress(superAccount.currency, rng) : address],
    recipients: [
      type === "IN" ? genAddress(superAccount.currency, rng) : address
    ],
    blockHash: genHex(64, rng),
    blockHeight:
      superAccount.blockHeight - Math.floor((Date.now() - date) / 900000),
    accountId: account.id,
    date,
    extra: {}
  };

  if (account.type === "Account") {
    const { tokenAccounts } = account;
    if (tokenAccounts) {
      // TODO make sure tokenAccounts sometimes reuse an existing op hash from main account
      op.subOperations = inferSubOperations(hash, tokenAccounts);
    }
  }

  return op;
}

/**
 * @memberof mock/account
 */
export function genAddingOperationsInAccount(
  account: Account,
  count: number,
  seed: number | string
): Account {
  const rng = new Prando(seed);
  const copy: Account = { ...account };
  copy.operations = Array(count)
    .fill(null)
    .reduce(ops => {
      const op = genOperation(copy, copy, ops, rng);
      return ops.concat(op);
    }, copy.operations);
  copy.balance = ensureNoNegative(copy.operations);
  return copy;
}

/**
 * @param id is a number or a string, used as an account identifier and as a seed for the generation.
 * @memberof mock/account
 */
type GenAccountOptions = {
  operationsSize?: number,
  currency?: CryptoCurrency,
  tokenAccountsCount?: number
};

function genTokenAccount(
  index: number,
  account: Account
): $Exact<TokenAccount> {
  const rng = new Prando(account.id + "|" + index);
  const tokens = listTokensForCryptoCurrency(account.currency);
  const token = rng.nextArrayItem(tokens);
  const tokenAccount = {
    type: "TokenAccount",
    id: account.id + "|" + index,
    parentId: account.id,
    token,
    operations: [],
    pendingOperations: [],
    balance: BigNumber(0)
  };

  const operationsSize = rng.nextInt(1, 200);
  tokenAccount.operations = Array(operationsSize)
    .fill(null)
    .reduce((ops: Operation[]) => {
      const op = genOperation(account, tokenAccount, ops, rng);
      return ops.concat(op);
    }, []);
  tokenAccount.balance = ensureNoNegative(tokenAccount.operations);
  return tokenAccount;
}

export function genAccount(
  id: number | string,
  opts: GenAccountOptions = {}
): $Exact<Account> {
  const rng = new Prando(id);
  const currency = opts.currency || rng.nextArrayItem(currencies);
  const operationsSize = opts.operationsSize || rng.nextInt(1, 200);
  const address = genAddress(currency, rng);
  const account: $Exact<Account> = {
    type: "Account",
    id: `mock:1:${currency.id}:${id}:`,
    seedIdentifier: "mock",
    derivationMode: "",
    xpub: genHex(64, rng),
    index: 1,
    freshAddress: address,
    freshAddressPath: runDerivationScheme(
      getDerivationScheme({ currency, derivationMode: "" }),
      currency
    ),
    name: rng.nextString(rng.nextInt(4, 34)),
    balance: BigNumber(0),
    blockHeight: rng.nextInt(100000, 200000),
    currency,
    unit: rng.nextArrayItem(currency.units),
    operations: [],
    pendingOperations: [],
    lastSyncDate: new Date()
  };

  if (currency.id === "ethereum" || currency.id === "ethereum_ropsten") {
    const tokenCount =
      typeof opts.tokenAccountsCount === "number"
        ? opts.tokenAccountsCount
        : rng.nextInt(0, 8);
    account.tokenAccounts = Array(tokenCount)
      .fill(null)
      .map((_, i) => genTokenAccount(i, account));
  }

  account.operations = Array(operationsSize)
    .fill(null)
    .reduce((ops: Operation[]) => {
      const op = genOperation(account, account, ops, rng);
      return ops.concat(op);
    }, []);

  account.balance = ensureNoNegative(account.operations);
  return account;
}
