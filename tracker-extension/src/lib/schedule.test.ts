import { expect, it } from 'vitest';
import { formatMinutes, overtimeMinutes, parseSchedule, planFor, punctuality } from './schedule';

// 2026-10-26 is a Monday (day "1"). Dhaka = UTC+6.
const dhaka = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00+06:00`);
const schedule = parseSchedule({ days: { '1': [{ start: '21:00', end: '23:00' }, { start: '15:00', end: '18:00' }], '5': [] }, break_minutes: 30, grace_minutes: 0 })!;

it('picks the 3 PM shift for a 3:10 PM check-in and reports 10 minutes late', () => {
  const plan = planFor(schedule, dhaka('15:10'))!;
  expect(plan.label).toBe('3:00 PM – 6:00 PM');
  expect(punctuality(plan, dhaka('15:10'))).toEqual({ kind: 'late', minutes: 10 });
});
it('reports early arrival before the 9 PM shift', () => {
  const plan = planFor(schedule, dhaka('20:55'))!;
  expect(plan.label).toBe('9:00 PM – 11:00 PM');
  expect(punctuality(plan, dhaka('20:55'))).toEqual({ kind: 'early', minutes: 5 });
});
it('counts overtime after the scheduled end', () => {
  const plan = planFor(schedule, dhaka('15:00'))!;
  expect(overtimeMinutes(plan, dhaka('18:45'))).toBe(45);
  expect(overtimeMinutes(plan, dhaka('17:59'))).toBe(0);
});
it('grace minutes keep a slightly late check-in on time', () => {
  const graced = parseSchedule({ days: { '1': [{ start: '15:00', end: '18:00' }] }, break_minutes: 0, grace_minutes: 15 })!;
  expect(punctuality(planFor(graced, dhaka('15:10'))!, dhaka('15:10')).kind).toBe('ontime');
});
it('returns no plan on a day off or without a schedule', () => {
  expect(planFor(schedule, Date.parse('2026-10-30T15:00:00+06:00'))).toBeNull();
  expect(planFor(null, dhaka('15:00'))).toBeNull();
});
it('formats break durations', () => {
  expect(formatMinutes(30)).toBe('30m');
  expect(formatMinutes(90)).toBe('1h 30m');
});
