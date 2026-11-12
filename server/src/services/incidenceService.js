'use strict';

const populationData = require('../data/districtPopulation2024.json');
const { PROVINCE_TO_DISTRICTS } = require('./surveillanceService');

const DISTRICT_POPULATION_2024 = populationData.districts || {};

function getDistrictPopulation(districtName) {
  if (!districtName) return null;
  const pop = DISTRICT_POPULATION_2024[districtName];
  return typeof pop === 'number' && pop > 0 ? pop : null;
}

function getProvincePopulation(provinceName) {
  if (!provinceName || !PROVINCE_TO_DISTRICTS[provinceName]) return null;
  const districts = PROVINCE_TO_DISTRICTS[provinceName];
  let sum = 0;
  for (const d of districts) {
    const p = exports.getDistrictPopulation(d);
    if (p === null) return null;
    sum += p;
  }
  return sum > 0 ? sum : null;
}

function getIslandPopulation() {
  if (typeof populationData.islandTotal === 'number' && populationData.islandTotal > 0) {
    return populationData.islandTotal;
  }
  let sum = 0;
  for (const pop of Object.values(DISTRICT_POPULATION_2024)) {
    if (typeof pop === 'number') sum += pop;
  }
  return sum > 0 ? sum : null;
}

function calculateIncidencePer100k(cases, districtName) {
  const population = exports.getDistrictPopulation(districtName);
  if (typeof cases !== 'number' || population === null) {
    return {
      incidence: null,
      display: 'N/A',
      hasPopulation: false,
      population: null
    };
  }
  const rate = Number(((cases / population) * 100000).toFixed(2));
  return {
    incidence: rate,
    display: `${rate} / 100k`,
    hasPopulation: true,
    population
  };
}

function calculateProvinceIncidencePer100k(cases, provinceName) {
  const population = exports.getProvincePopulation(provinceName);
  if (typeof cases !== 'number' || population === null) {
    return {
      incidence: null,
      display: 'N/A',
      hasPopulation: false,
      population: null
    };
  }
  const rate = Number(((cases / population) * 100000).toFixed(2));
  return {
    incidence: rate,
    display: `${rate} / 100k`,
    hasPopulation: true,
    population
  };
}

function calculateIslandIncidencePer100k(cases) {
  const population = exports.getIslandPopulation();
  if (typeof cases !== 'number' || population === null) {
    return {
      incidence: null,
      display: 'N/A',
      hasPopulation: false,
      population: null
    };
  }
  const rate = Number(((cases / population) * 100000).toFixed(2));
  return {
    incidence: rate,
    display: `${rate} / 100k`,
    hasPopulation: true,
    population
  };
}

exports.DISTRICT_POPULATION_2024 = DISTRICT_POPULATION_2024;
exports.getDistrictPopulation = getDistrictPopulation;
exports.getProvincePopulation = getProvincePopulation;
exports.getIslandPopulation = getIslandPopulation;
exports.calculateIncidencePer100k = calculateIncidencePer100k;
exports.calculateProvinceIncidencePer100k = calculateProvinceIncidencePer100k;
exports.calculateIslandIncidencePer100k = calculateIslandIncidencePer100k;
