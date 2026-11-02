import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NEW_YEAR_MOSCOW,newYearCountdown,russianUnit} from '../concepts/new-year-2027/countdown.mjs';

test('New Year starts at Moscow midnight, three hours before UTC midnight',()=>{
  assert.equal(NEW_YEAR_MOSCOW,Date.parse('2026-12-31T21:00:00Z'));
  assert.equal(newYearCountdown(Date.parse('2026-12-31T20:59:00Z')).expired,false);
  assert.equal(newYearCountdown(Date.parse('2026-12-31T21:00:00Z')).expired,true);
});
test('countdown contains complete days, hours and minutes instead of calendar rounding',()=>{
  assert.deepEqual(newYearCountdown(Date.parse('2026-11-02T12:34:00+03:00')),{days:59,hours:11,minutes:26,expired:false});
  assert.deepEqual(newYearCountdown(Date.parse('2026-12-30T23:59:00+03:00')),{days:1,hours:0,minutes:1,expired:false});
});
test('the same instant gives identical results for visitors in other timezones',()=>{
  assert.deepEqual(newYearCountdown(Date.parse('2026-12-31T12:00:00-08:00')),newYearCountdown(Date.parse('2026-12-31T23:00:00+03:00')));
  assert.deepEqual(newYearCountdown(Date.parse('2026-12-31T12:00:00-08:00')),{days:0,hours:1,minutes:0,expired:false});
});
test('countdown ends at zero and never restarts or becomes negative',()=>{
  assert.deepEqual(newYearCountdown(NEW_YEAR_MOSCOW),{days:0,hours:0,minutes:0,expired:true});
  assert.deepEqual(newYearCountdown(NEW_YEAR_MOSCOW+86400000),{days:0,hours:0,minutes:0,expired:true});
});
test('Russian labels follow the displayed numbers',()=>{
  assert.equal(russianUnit(1,'день','дня','дней'),'день');
  assert.equal(russianUnit(2,'день','дня','дней'),'дня');
  assert.equal(russianUnit(11,'день','дня','дней'),'дней');
  assert.equal(russianUnit(21,'минута','минуты','минут'),'минута');
  assert.equal(russianUnit(14,'час','часа','часов'),'часов');
});
