import districtPopulationData from '../data/districtPopulation2024.json';
import { PROVINCE_TO_DISTRICTS } from './districtAdjacency';

export const DISTRICT_POPULATION_2024 = districtPopulationData.districts || {};

export function getDistrictPopulation(districtName) {
  if (!districtName) return null;
  const pop = DISTRICT_POPULATION_2024[districtName];
  return typeof pop === 'number' && pop > 0 ? pop : null;
}

export function getProvincePopulation(provinceName) {
  if (!provinceName || !PROVINCE_TO_DISTRICTS[provinceName]) return null;
  const districts = PROVINCE_TO_DISTRICTS[provinceName];
  let sum = 0;
  for (const d of districts) {
    const p = getDistrictPopulation(d);
    if (p === null) return null; // If any district has pending population, province is pending
    sum += p;
  }
  return sum > 0 ? sum : null;
}

export function calculateIncidencePer100k(cases, districtName) {
  const population = getDistrictPopulation(districtName);
  if (typeof cases !== 'number' || population === null) {
    return {
      incidence: null,
      display: 'population data pending',
      hasPopulation: false
    };
  }
  const rate = Number(((cases / population) * 100000).toFixed(2));
  return {
    incidence: rate,
    display: `${rate} / 100k`,
    hasPopulation: true
  };
}

export function calculateProvinceIncidencePer100k(cases, provinceName) {
  const population = getProvincePopulation(provinceName);
  if (typeof cases !== 'number' || population === null) {
    return {
      incidence: null,
      display: 'population data pending',
      hasPopulation: false
    };
  }
  const rate = Number(((cases / population) * 100000).toFixed(2));
  return {
    incidence: rate,
    display: `${rate} / 100k`,
    hasPopulation: true
  };
}
