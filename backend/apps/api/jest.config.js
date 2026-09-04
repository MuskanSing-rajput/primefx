/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@lp/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@lp/validators$': '<rootDir>/../../packages/validators/src/index.ts',
    '^@lp/constants$': '<rootDir>/../../packages/constants/src/index.ts',
  },
}