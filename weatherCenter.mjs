import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import HDWalletProvider from '@truffle/hdwallet-provider';
import Web3 from 'web3';
import { ethers } from 'ethers';
import WeatherABI from './ABIs/Weather.json';
import Multicall2ABI from './ABIs/Multicall2.json';
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
const Multicall2 = '0x654dc44392C6Fe6ae739BDaB640F6C681785c726';

const provider = new HDWalletProvider(
  process.env.PRIVATE_KEY,
  `https://cronos-testnet-3.crypto.org:8545`
);
const web3 = new Web3(provider);

const weatherContract = new web3.eth.Contract(WeatherABI, WeatherCenter);
const multicallContract = new web3.eth.Contract(
  Multicall2ABI,
  Multicall2
);

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

  const callDataList = [];

  Object.keys(Cities).forEach((key) => {
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

    callDataList.push([
      WeatherCenter,
      weatherContract.methods
        .reportWeather(batchId, cityNameHex, tempUint32)
        .encodeABI(),
    ]);
  });

  const multicallInstance = await multicallContract.methods.aggregate(
    callDataList
  );

  const options = {
    from: '0x766De35346B6112Dc1aE559f60C0886e2A7ed5A5',
    gasPrice: 2975536764061,
  };

  multicallInstance.send(options);
};

function splitTempBinaryInThree(string) {
  const string1 = string.slice(0, 1);
  const string2 = string.slice(1, 8);
  const string3 = string.slice(8, 15);

  return [string1, string2, string3];
}

async function extractTemp(temperature) {
  const [signBinary, integerBinary, floatBinary] = splitTempBinaryInThree(
    web3.utils.padLeft(decimalToBinary(temperature), 15)
  );

  const sign = signBinary === '1' ? '+' : '-';
  const integer = binaryToDecimal(integerBinary);
  const float = binaryToDecimal(floatBinary);

  const number = +`${integer}.${float}`;
  const formattedTemp = `${sign}${number}°C`;

  console.log('formattedTemp: ', formattedTemp);
}

// from record
const batchId = 1658070913;
const CitiesNameList = [
  '0x686f6e676b6f6e67000000000000000000000000000000000000000000000000',
  '0x6c6f6e646f6e0000000000000000000000000000000000000000000000000000',
  '0x7368616e67686169000000000000000000000000000000000000000000000000',
];

const getWeather = async () => {
  const { returnData } = await multicallContract.methods
    .aggregate([
      [
        WeatherCenter,
        weatherContract.methods
          .getWeather(batchId, CitiesNameList[0])
          .encodeABI(),
      ],
      [
        WeatherCenter,
        weatherContract.methods
          .getWeather(batchId, CitiesNameList[1])
          .encodeABI(),
      ],
      [
        WeatherCenter,
        weatherContract.methods
          .getWeather(batchId, CitiesNameList[2])
          .encodeABI(),
      ],
    ])
    .call();

  const formattedTemp = returnData
    .map((d) => parseInt(web3.eth.abi.decodeParameter('uint256', d)))
    .map((n) => extractTemp(n));

  // log:
  // formattedTemp:  -12°C
  // formattedTemp:  +27.4°C
  // formattedTemp:  +100°C
};

// reportWeather();
getWeather();
