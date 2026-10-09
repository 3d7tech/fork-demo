import type { FamilyDef } from './types';
import { num, partOf, profileFrom, taxYearStart } from './shared';

/**
 * Starting estimates for the person's own car and charging, shown as estimates and changeable.
 * They are not tax rules; open question 10 asks for a reviewed source.
 */
const OWN_CAR = { leaseMonthly: 430, insuranceServicing: 1200, mpg: 45, fuelPerLitre: 1.4 };
const CHARGING = { homePerKwh: 0.1, publicPerKwh: 0.7, milesPerKwh: 3.5 };

export const evScheme: FamilyDef<'benefits.ev_scheme'> = {
  id: 'benefits.ev_scheme_or_own_car',
  audience: 'employee',
  title: 'An electric car through work, or your own car',
  description: 'Whether to get an electric car through the company salary sacrifice scheme or keep running your own car',
  module: 'benefits.ev_scheme',
  profile: true,
  rulePack: 'uk-2026-27',
  questionSetsLevers: true,
  template: {
    specVersion: '1.0',
    decisionType: 'comparison',
    family: 'benefits.ev_scheme_or_own_car',
    audience: 'employee',
    question: '',
    options: [
      { id: 'own_car', label: 'Keep my own petrol car' },
      { id: 'scheme', label: 'Electric car through the scheme' },
    ],
    constraints: [{ id: 'home_charging', kind: 'ask', question: 'Can you charge at home?', default: 'yes', effect: 'changes_numbers' }],
    levers: [
      { id: 'monthly_cost', label: 'Scheme cost a month before tax', min: 150, max: 1500, step: 10, default: 600, unit: 'GBP' },
      { id: 'list_price', label: 'Car’s list price', min: 15000, max: 100000, step: 1000, default: 42000, unit: 'GBP' },
      { id: 'miles_per_year', label: 'Miles a year', min: 3000, max: 25000, step: 500, default: 9000, unit: 'miles' },
    ],
    facts: [],
    calculation: { module: 'benefits.ev_scheme', rulePack: 'uk-2026-27' },
    visual: 'cost_bars',
    action: { type: 'payroll.request', to: 'accountant', label: 'Ask to join the car scheme' },
    watch: ['salary', 'rulePack'],
  },
  facts: [{ id: 'salary', label: 'Your pay a year', unit: 'GBP' }],
  answers: { home_charging: 'yes' },
  levers: ['monthly_cost', 'list_price', 'miles_per_year'],
  buildInput(f, a, l) {
    return {
      ...profileFrom(f),
      salary: num(f.salary),
      milesPerYear: l.miles_per_year ?? 9000,
      homeCharging: a.home_charging !== 'no',
      scheme: { monthlyGross: l.monthly_cost ?? 600, listPrice: l.list_price ?? 42000, termYears: 3, startDate: taxYearStart() },
      ownCar: OWN_CAR,
      charging: CHARGING,
    };
  },
  defaultLayout: {
    visual: 'cost_bars',
    leverOrder: ['monthly_cost', 'list_price', 'miles_per_year'],
    outcomeTiles: ['saving', 'scheme_cost', 'own_car_cost'],
    constraintOrder: ['home_charging'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const p = (k: string, label: string, tone: 'a' | 'b' | 'c' | 'd') => partOf(calc, display, k, label, tone);
    const saving = calc.outputs.saving!.value;
    return {
      type: 'towers',
      title: 'What each costs you a year',
      towers: [
        { label: 'Own petrol car', total: { value: calc.outputs.own_car_cost!.value, display: display('own_car_cost') }, parts: [p('own_car_lease', 'Lease', 'a'), p('own_car_insurance', 'Insurance and servicing', 'c'), p('own_car_fuel', 'Fuel', 'd')] },
        { label: 'Electric car scheme', total: { value: calc.outputs.scheme_cost!.value, display: display('scheme_cost') }, parts: [p('scheme_net_lease', 'Lease after tax savings', 'b'), p('scheme_bik_tax', 'Company car tax', 'c'), p('scheme_charging', 'Charging', 'd')] },
      ],
      difference: { value: saving, display: display('saving').replace(/^[−-]/, ''), label: saving >= 0 ? 'less a year on the scheme' : 'more a year on the scheme' },
    };
  },
  request(r) {
    return { summary: `${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} would like to join the electric car salary sacrifice scheme, at about £${(r.levers.monthly_cost ?? 0).toLocaleString('en-GB')} a month before tax. Please send them the scheme’s application and check it keeps their pay above the minimum wage.` };
  },
  sweep: { lever: 'miles_per_year', series: [{ key: 'scheme_cost', label: 'Electric car scheme' }, { key: 'own_car_cost', label: 'Own petrol car' }] },
  steps: { facts: 'Read your pay', checks: 'Checked company car tax for the next three years' },
};
