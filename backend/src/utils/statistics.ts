export function getMean(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function getStdDev(values: number[], mean: number) {
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    values.length;

  return Math.sqrt(variance);
}

export function removeOutliers(values: number[]) {
  if (values.length < 5) return values;

  const mean = getMean(values);
  const stdDev = getStdDev(values, mean);

  if (stdDev === 0) return values;

  const threshold = 2;

  return values.filter((v) => {
    const zScore = Math.abs((v - mean) / stdDev);
    return zScore <= threshold;
  });
}