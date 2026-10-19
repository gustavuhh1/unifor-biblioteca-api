import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  js.configs.recommended,
  tseslint.configs.recommended,
  // Must stay last: turns off the rules that conflict with Prettier.
  eslintConfigPrettier,
])
