import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'

const FOREX_PAIRS = {
  'EUR/USD OTC': 'EUR/USD',
  'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY',
  'USD/CHF OTC': 'USD/CHF',
  'AUD/USD OTC': 'AUD/USD',
  'USD/CAD OTC': 'USD/CAD',
  'NZD/USD OTC': 'NZD/USD',
  'EUR/GBP OTC': 'EUR/GBP',
  'EUR/JPY OTC': 'EUR/JPY',
  'EUR/CHF OTC': 'EUR/CHF',
  'EUR/AUD OTC': 'EUR/AUD',
  'EUR/CAD OTC': 'EUR/CAD',
  'EUR/NZD OTC': 'EUR/NZD',
  'GBP/JPY OTC': 'GBP/JPY',
  'GBP/CHF OTC': 'GBP/CHF',
  'GBP/AUD OTC': 'GBP/AUD',
  'GBP/CAD OTC': 'GBP/CAD',
  'GBP/NZD OTC': 'GBP/NZD',
  'AUD/JPY OTC': 'AUD/JPY',
  'AUD/CHF OTC': 'AUD/CHF',
  'AUD/CAD OTC': 'AUD/CAD',
  'AUD/NZD OTC': 'AUD/NZD',
  'CAD/JPY OTC': 'CAD/JPY',
  'CAD/CHF OTC': 'CAD/CHF',
  'NZD/JPY OTC': 'NZD/JPY',
  'NZD/CHF OTC': 'NZD/CHF',
  'CHF/JPY OTC': 'CHF/JPY',
  'USD/SGD OTC': 'USD/SGD',
  'USD/HKD OTC': 'USD/HKD',
  'USD/MXN OTC': 'USD/MXN',
  'USD/ZAR OTC': 'USD/ZAR',
  'USD/TRY OTC': 'USD/TRY',
  'EUR/TRY OTC': 'EUR/TRY',
  'GBP/TRY OTC': 'GBP/TRY',
  'USD/INR OTC': 'USD/INR',
}

const COMMODITY_PAIRS = {
  'GOLD OTC': 'XAU/USD',
  'SILVER OTC': 'XAG/USD',
  'OIL OTC': 'WTI/USD',
}

const CRYPTO_PAIRS = {
  'BTC/USD OTC': 'BTCUSDT',
}

const BROKERS = ['Quotex', 'IQ Option', 'Pocket Option', 'Expert Option']
const TIMEFRAMES = ['1', '3', '5', '15']

const TF_TO_YAHOO = { '1': '1m', '3': '1m', '5': '5m', '15': '15m' }
const TF_TO_BINANCE = { '1': '1m', '3': '3m', '5': '5m', '15': '15m' }

const YAHOO_MAP = {
  'EUR/USD': 'EURUSD=X', 'GBP/USD': 'GBPUSD=X', 'USD/JPY': 'USDJPY=X',
  'USD/CHF': 'USDCHF=X', 'AUD/USD': 'AUDUSD=X', 'USD/CAD': 'USDCAD=X',
  'NZD/USD': 'NZDUSD=X', 'EUR/GBP': 'EURGBP=X', 'EUR/JPY': 'EURJPY=X',
  'EUR/CHF': 'EURCHF=X', 'EUR/AUD': 'EURAUD=X', 'EUR/CAD': 'EURCAD=X',
  'EUR/NZD': 'EURNZD=X', 'GBP/JPY': 'GBPJPY=X', 'GBP/CHF': 'GBPCHF=X',
  'GBP/AUD': 'GBPAUD=X', 'GBP/CAD': 'GBPCAD=X', 'GBP/NZD': 'GBPNZD=X',
  'AUD/JPY': 'AUDJPY=X', 'AUD/CHF': 'AUDCHF=X', 'AUD/CAD': 'AUDCAD=X',
  'AUD/NZD': 'AUDNZD=X', 'CAD/JPY': 'CADJPY=X', 'CAD/CHF': 'CADCHF=X',
  'NZD/JPY': 'NZDJPY=X', 'NZD/CHF': 'NZDCHF=X', 'CHF/JPY': 'CHFJPY=X',
  'USD/SGD': 'USDSGD=X', 'USD/HKD': 'USDHKD=X', 'USD/MXN': 'USDMXN=X',
  'USD/ZAR': 'USDZAR=X', 'USD/TRY': 'USDTRY=X', 'EUR/TRY': 'EURTRY=X',
  'GBP/TRY': 'GBPTRY=X', 'USD/INR': 'USDINR=X',
  'XAU/USD': 'GC=F', 'XAG/USD': 'SI=F', '
