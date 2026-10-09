import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, q, ZERO, type Rules } from '../core';
import { profileAssumptions, profileOf, type Profiled } from '../profile';
import { jobPay } from '../uk';

export interface EvSchemeInput extends Profiled {
  salary: number;
  milesPerYear: number;
  homeCharging: boolean;
  scheme: { monthlyGross: number; listPrice: number; termYears: number; startDate: string };
  /** Estimates unless the person gives their own figures. */
  ownCar: { leaseMonthly: number; insuranceServicing: number; mpg: number; fuelPerLitre: number };
  charging: { homePerKwh: number; publicPerKwh: number; milesPerKwh: number };
}

const LITRES_PER_GALLON = 4.546;

/** Average benefit-in-kind percentage across the scheme term, one tax year at a time. */
function averageBikRate(r: Rules, start: string, years: number): Decimal {
  let sum = ZERO;
  const y0 = Number(start.slice(0, 4));
  for (let k = 0; k < years; k++) sum = sum.plus(r.at(`${y0 + k}${start.slice(4)}`).num('company_car.appropriate_pct_zero_emission'));
  return sum.div(years);
}

export function evScheme(r: Rules, i: EvSchemeInput): CalcResult {
  const profile = profileOf(i);
  const sacrifice = D(i.scheme.monthlyGross).times(12);
  const bikRate = averageBikRate(r, i.scheme.startDate, i.scheme.termYears);
  const bikValue = D(i.scheme.listPrice).times(bikRate);
  // What each step costs the person, net of any change in the Child Benefit charge.
  const net = (x: { takeHome: Decimal; childBenefitCharge: Decimal }) => x.takeHome.minus(x.childBenefitCharge);
  const without = jobPay(r, { salary: i.salary, profile });
  const sacrificed = jobPay(r, { salary: i.salary, otherSacrifice: sacrifice, profile });
  const withCar = jobPay(r, { salary: i.salary, otherSacrifice: sacrifice, benefitInKind: bikValue, profile });
  // The lease comes out of gross pay, so its real cost is the take-home it removes.
  const netLease = net(without).minus(net(sacrificed));
  const bikTax = net(sacrificed).minus(net(withCar));

  const perMilePetrol = D(1).div(i.ownCar.mpg).times(LITRES_PER_GALLON).times(i.ownCar.fuelPerLitre);
  const perMileHome = D(i.charging.homePerKwh).div(i.charging.milesPerKwh);
  const perMilePublic = D(i.charging.publicPerKwh).div(i.charging.milesPerKwh);
  const perMileEv = i.homeCharging ? perMileHome : perMilePublic;

  const ownFixed = D(i.ownCar.leaseMonthly).times(12).plus(i.ownCar.insuranceServicing);
  const evFixed = netLease.plus(bikTax);
  const costs = (miles: number, perMile: Decimal) => ({ own: ownFixed.plus(perMilePetrol.times(miles)), ev: evFixed.plus(perMile.times(miles)) });
  const c = costs(i.milesPerYear, perMileEv);
  const save = c.own.minus(c.ev);

  // Without home charging, the miles at which the scheme stops being cheaper.
  const crossover = perMilePetrol.minus(perMilePublic).isZero() ? null : evFixed.minus(ownFixed).div(perMilePetrol.minus(perMilePublic));
  const employerNet = sacrifice.times(r.num('er_ni.rate')).minus(bikValue.times(r.num('er_ni.class_1a_rate')));

  return {
    module: 'benefits.ev_scheme',
    rulePack: r.packInfo(),
    verdict: save.gt(0) ? 'scheme' : 'own_car',
    outputs: {
      own_car_cost: q(c.own, 'GBP', 'Own petrol car a year', true),
      own_car_lease: q(D(i.ownCar.leaseMonthly).times(12), 'GBP', 'Lease a year', true),
      own_car_insurance: q(i.ownCar.insuranceServicing, 'GBP', 'Insurance and servicing a year', true),
      own_car_fuel: q(perMilePetrol.times(i.milesPerYear), 'GBP', 'Fuel a year', true),
      scheme_cost: q(c.ev, 'GBP', 'EV scheme a year, after tax savings'),
      scheme_net_lease: q(netLease, 'GBP', 'Lease after tax and NI savings'),
      scheme_bik_tax: q(bikTax, 'GBP', 'Company car tax a year'),
      scheme_charging: q(perMileEv.times(i.milesPerYear), 'GBP', 'Charging a year', true),
      bik_rate_avg_pct: q(bikRate.times(100), 'pct', 'Average company car tax percentage over the term'),
      saving: q(save, 'GBP', 'Scheme saving a year'),
      saving_term: q(save.times(i.scheme.termYears), 'GBP', 'Saving over the term'),
      employer_net_saving: q(employerNet, 'GBP', 'Employer NI saved after Class 1A'),
      ...(crossover && crossover.gt(0) ? { crossover_miles_public: q(crossover, 'miles', 'Miles a year above which public charging makes the scheme dearer') } : {}),
    },
    tippingPoint: crossover && crossover.gt(0)
      ? { description: 'Without home charging, the scheme stops being cheaper above this mileage', measure: 'miles_per_year', at: crossover.toNumber(), unit: 'miles' }
      : undefined,
    leverRanges: leverRanges('miles_per_year', { min: 3000, max: 25000, step: 500 }, (m) => {
      const x = costs(m, perMileEv);
      return x.own.gt(x.ev) ? 'scheme' : 'own_car';
    }),
    constraints: [{ id: 'home_charging', outcome: i.homeCharging ? 'pass' : 'caution' }],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `EV scheme £${i.scheme.monthlyGross} a month gross including insurance; list price £${i.scheme.listPrice.toLocaleString('en-GB')}`, source: 'policy_document', estimate: false },
      { text: `Company car tax averaged over ${i.scheme.termYears} tax years from ${i.scheme.startDate}`, source: 'rules', estimate: false },
      { text: `Own car: about £${i.ownCar.leaseMonthly} a month lease, about £${i.ownCar.insuranceServicing.toLocaleString('en-GB')} insurance and servicing, about ${i.ownCar.mpg} mpg at about £${i.ownCar.fuelPerLitre.toFixed(2)} a litre`, source: 'estimate', estimate: true },
      { text: `Charging about ${Math.round(i.charging.homePerKwh * 100)}p a kWh at home, about ${Math.round(i.charging.publicPerKwh * 100)}p public, about ${i.charging.milesPerKwh} miles a kWh`, source: 'estimate', estimate: true },
      ...profileAssumptions(r, i, { adjustedNetIncome: withCar.adjustedNetIncome }),
    ],
  };
}
