// Midnight in Moscow, independent of the visitor's computer timezone.
export const NEW_YEAR_MOSCOW=Date.parse('2027-01-01T00:00:00+03:00');
export function newYearCountdown(now=Date.now()){
  const remaining=Math.max(0,NEW_YEAR_MOSCOW-Number(now));
  const totalMinutes=Math.floor(remaining/60000);
  return {days:Math.floor(totalMinutes/1440),hours:Math.floor(totalMinutes/60)%24,minutes:totalMinutes%60,expired:remaining===0};
}
export function russianUnit(value,one,few,many){
  const last=value%10,lastTwo=value%100;
  return last===1&&lastTwo!==11?one:last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?few:many;
}
