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

function formatPopulationShare(cases, districtName) {
  let pop = exports.getDistrictPopulation(districtName);
  if (!pop && districtName) {
    const norm = String(districtName).trim().toLowerCase();
    if (['island', 'island-wide', 'sri lanka', 'all'].includes(norm)) {
      pop = exports.getIslandPopulation();
    } else {
      pop = exports.getProvincePopulation(districtName);
    }
  }
  const count = Math.max(0, Number(cases) || 0);
  if (count <= 0 || !pop || pop <= 0) {
    return {
      sharePct: 0,
      formattedShare: '0%',
      incidencePer100k: 0,
      population: pop || null,
      display: count > 0 && !pop ? 'N/A' : '0% of district population (0 per 100,000)'
    };
  }
  const rawPct = (count / pop) * 100;
  let formattedShare;
  if (rawPct < 0.0001) formattedShare = rawPct.toFixed(5) + '%';
  else if (rawPct < 0.01) formattedShare = rawPct.toFixed(4) + '%';
  else formattedShare = rawPct.toFixed(2) + '%';
  if (parseFloat(formattedShare) === 0 && count > 0) {
    formattedShare = '<0.00001%';
  }

  const incidence = Number(((count / pop) * 100000).toFixed(2));
  return {
    sharePct: rawPct,
    formattedShare,
    incidencePer100k: incidence,
    population: pop,
    display: `${formattedShare} of district population, ${incidence} per 100,000`
  };
}

function formatChangePercent(current, previous) {
  const curr = Math.max(0, Number(current) || 0);
  const prev = Math.max(0, Number(previous) || 0);
  if (prev === 0) {
    return curr > 0 ? 'new' : '0%';
  }
  const diff = curr - prev;
  const pct = (diff / prev) * 100;
  if (isNaN(pct) || !isFinite(pct)) return '0%';
  const sign = pct > 0 ? '+' : '';
  if (Math.abs(pct) < 1 && pct !== 0) {
    return `${sign}${pct.toPrecision(2)}%`;
  }
  return `${sign}${pct.toFixed(1)}%`;
}

exports.DISTRICT_POPULATION_2024 = DISTRICT_POPULATION_2024;
exports.getDistrictPopulation = getDistrictPopulation;
exports.getProvincePopulation = getProvincePopulation;
exports.getIslandPopulation = getIslandPopulation;
exports.calculateIncidencePer100k = calculateIncidencePer100k;
exports.calculateProvinceIncidencePer100k = calculateProvinceIncidencePer100k;
exports.calculateIslandIncidencePer100k = calculateIslandIncidencePer100k;
exports.formatPopulationShare = formatPopulationShare;
exports.formatChangePercent = formatChangePercent;
