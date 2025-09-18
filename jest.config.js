export default {
    testEnvironment: 'node',
    transform: {
        '^.+\\.(t|j)sx?$': ['@swc/jest'], // Use SWC for TypeScript and JSX

    }
};