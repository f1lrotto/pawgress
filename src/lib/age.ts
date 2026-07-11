type DateParts = { year: number; month: number; day: number };

const daysInMonth = (year: number, month: number) =>
  [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

const parseDate = (value: string): DateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
    ? { year, month, day }
    : null;
};

const compare = (left: DateParts, right: DateParts) =>
  left.year - right.year || left.month - right.month || left.day - right.day;

export const getAgeParts = (birthday: string, today: string) => {
  const birth = parseDate(birthday);
  const current = parseDate(today);
  if (!birth || !current || compare(birth, current) > 0) return null;

  let totalMonths =
    (current.year - birth.year) * 12 + current.month - birth.month;
  const candidateYear =
    birth.year + Math.floor((birth.month - 1 + totalMonths) / 12);
  const candidateMonth = ((birth.month - 1 + totalMonths) % 12) + 1;
  const candidate = {
    year: candidateYear,
    month: candidateMonth,
    day: Math.min(birth.day, daysInMonth(candidateYear, candidateMonth)),
  };
  if (compare(candidate, current) > 0) totalMonths -= 1;

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
};
