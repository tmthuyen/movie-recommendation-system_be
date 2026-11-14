import * as bcrypt from 'bcrypt';

const hashBcrypt = async (
  data: string,
  saltRounds: number = 10,
): Promise<string> => {
  const hashed = await bcrypt.hash(data, saltRounds);

  return hashed;
};

const compareBcrypt = async (
  data: string,
  hashedData: string,
): Promise<boolean> => {
  const isMatch = await bcrypt.compare(data, hashedData);
  return isMatch;
};

export const hashUtil = {
  hashBcrypt,
  compareBcrypt,
};
