/**
 * Same preset shape as @vitejs/plugin-react v6 — kept locally so we can use
 * @vitejs/plugin-react v5 (vite ^7 peer) with rolldown-vite 7.x; npm rejects
 * plugin-react v6’s vite@^8 peer against rolldown-vite@7.3.1.
 * @see https://react.dev/learn/react-compiler
 */
export function reactCompilerPreset(options: Record<string, unknown> = {}) {
  return {
    preset: () => ({
      plugins: [['babel-plugin-react-compiler', options] as const],
    }),
    rolldown: {
      filter: {
        code:
          options.compilationMode === 'annotation'
            ? /['"]use memo['"]/
            : /\b[A-Z]|\buse/,
      },
      applyToEnvironmentHook: (env: { config: { consumer: string } }) =>
        env.config.consumer === 'client',
      optimizeDeps: {
        include:
          options.target === '17' || options.target === '18'
            ? ['react-compiler-runtime']
            : ['react/compiler-runtime'],
      },
    },
  }
}
