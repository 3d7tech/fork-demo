// Larkfield, the fictional company in the demo: 34 salaries, all on 37.5 contracted hours a week.
export const LARKFIELD_SALARIES = [
  25200, 26000, 28500, 29000, 30000, 31000, 32000, 32000, 33500, 34000, 35000, 35000, 36000, 37500, 38000, 39000, 40000, 41000, 42000,
  42000, 44000, 45000, 46000, 48000, 50000, 52000, 55000, 58000, 60000, 65000, 72000, 80000, 95000, 108000,
];
export const LARKFIELD = LARKFIELD_SALARIES.map((salary) => ({ salary, hoursPerWeek: 37.5 }));
