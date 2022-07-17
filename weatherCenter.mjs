import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import HDWalletProvider from '@truffle/hdwallet-provider';
import Web3 from 'web3';
import { ethers } from 'ethers';
import WeatherABI from './ABIs/Weather.json';
import NetworkRPC from './NetworkRPC.js';

dotenv.config();

const Cities = {
  SH: 'shanghai',
  HK: 'hongkong',
  LON: 'london',
};

const CityAPI = {
  [Cities.SH]: 'https://goweather.herokuapp.com/weather/shanghai',
  [Cities.HK]: 'https://goweather.herokuapp.com/weather/hongkong',
  [Cities.LON]: 'https://goweather.herokuapp.com/weather/london',
};

const WeatherCenter = '0x49354813d8BFCa86f778DfF4120ad80E4D96D74E';
const provider = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `https://cronos-testnet-3.crypto.org:8545`
);
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(WeatherABI, WeatherCenter);

const list = [
  {
    temperature: '+100 °C',
    wind: '11 km/h',
    description: 'Sunny',
    forecast: [
      { day: '1', temperature: '+37 °C', wind: '12 km/h' },
      { day: '2', temperature: '39 °C', wind: '14 km/h' },
      { day: '3', temperature: '+36 °C', wind: '9 km/h' },
    ],
  },
  {
    temperature: '-12 °C',
    wind: '11 km/h',
    description: 'Sunny',
    forecast: [
      { day: '1', temperature: '+37 °C', wind: '12 km/h' },
      { day: '2', temperature: '39 °C', wind: '14 km/h' },
      { day: '3', temperature: '+36 °C', wind: '9 km/h' },
    ],
  },
  {
    temperature: '+27.4 °C',
    wind: '11 km/h',
    description: 'Sunny',
    forecast: [
      { day: '1', temperature: '+37 °C', wind: '12 km/h' },
      { day: '2', temperature: '39 °C', wind: '14 km/h' },
      { day: '3', temperature: '+36 °C', wind: '9 km/h' },
    ],
  },
];

function decimalToBinary(decimal) {
  return parseInt(decimal).toString(2);
}

function binaryToDecimal(binary) {
  return parseInt(binary, 2);
}

const tempExtractRegex = /(\+|\-)(\d+)\.?(\d?) °C/;

const reportWeather = async () => {
  // the API go down
  // const [sh, hk, lon] = await Promise.all([
  //   fetch(CityAPI[Cities.SH]),
  //   fetch(CityAPI[Cities.HK]),
  //   fetch(CityAPI[Cities.LON]),
  // ]).then(
  //   async (responses) => await Promise.all(responses.map((res) => res.json()))
  // );

  const weatherData = {
    [Cities.SH]: list[0],
    [Cities.HK]: list[1],
    [Cities.LON]: list[2],
  };

  const batchId = parseInt(new Date().getTime() / 1000);

  Object.keys(Cities).forEach(async (key) => {
    const cityNameHex = web3.utils.padRight(
      web3.utils.asciiToHex(Cities[key]),
      64
    );
    const { temperature } = weatherData[Cities[key]];

    const [_, sign, integer, float] = temperature.match(tempExtractRegex);

    const signBinary = decimalToBinary(sign === '+' ? '1' : '0');
    const integerBinary = web3.utils.padLeft(decimalToBinary(integer), 7);
    const floatBinary = web3.utils.padLeft(
      decimalToBinary(float ? float : 0),
      7
    );
    // +100°C  =>  1 + 1100100 + 0000000
    // +27.4°C =>  1 + 0011011 + 0000100
    // -12°C   =>  0 + 0001100 + 0000000

    const tempUint32 = binaryToDecimal(
      signBinary + integerBinary + floatBinary
    );

    const reportWeatherFunc = contract.methods.reportWeather(
      batchId,
      cityNameHex,
      tempUint32
    );

    const options = {
      from: '0x766De35346B6112Dc1aE559f60C0886e2A7ed5A5',
      gasPrice: 2975536764061,
    };

    const gas = await reportWeatherFunc.estimateGas(options);
    console.log('gas:', gas);

    reportWeatherFunc.send(options);
  });
};

function splitTempBinaryInThree(string) {
  const string1 = string.slice(0, 1);
  const string2 = string.slice(1, 8);
  const string3 = string.slice(8, 16);

  return [string1, string2, string3];
}

// from record
const batchId = 1658070913;
const cityNameHex =
  '0x686f6e676b6f6e67000000000000000000000000000000000000000000000000';

const getWeather = async () => {
  const temperature = await contract.methods
    .getWeather(batchId, cityNameHex)
    .call();

  const [signBinary, integerBinary, floatBinary] = splitTempBinaryInThree(
    web3.utils.padLeft(decimalToBinary(temperature), 15)
  );

  const sign = signBinary === '1' ? '+' : '-';
  const integer = binaryToDecimal(integerBinary);
  const float = binaryToDecimal(floatBinary);

  const number = +`${integer}.${float}`;
  const formattedTemp = `${sign}${number}°C`;

  console.log('formattedTemp: ', formattedTemp)
};

// reportWeather();
getWeather();
