import { defineConfig } from 'orval';

export default defineConfig({
  dental: {
    input: {
      target: './packages/api-client/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './packages/api-client/src/generated/endpoints.ts',
      schemas: './packages/api-client/src/generated/model',
      client: 'react-query',
      override: {
        mutator: {
          path: './packages/api-client/src/mutator.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'biome format --write',
    },
  },
});
