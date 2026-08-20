type AppRecord = Record<string, any>
type AppCallback = (...args: any[]) => any
type ErrorLike = Error & { status?: number; detail?: any; body?: any }
type UiEvent = {
  target: any
  currentTarget: any
  clientX: number
  clientY: number
  pageX: number
  pageY: number
  button: number
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  deltaY: number
  preventDefault: () => void
  stopPropagation: () => void
}

declare module 'react' {
  export type ReactNode = any
  export type Dispatch<A> = (value: A) => void
  export type SetStateAction<S> = S | ((prevState: S) => S)
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]
  export function useMemo<T>(factory: () => T, deps: readonly any[]): T
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly any[]): void
  export function useRef<T>(initialValue: T): { current: T }
  export function useRef<T>(initialValue: T | null): { current: T | null }
  export function createContext<T>(defaultValue: T): any
  export function useContext<T = any>(context: any): T
  export function forwardRef(render: any): any
  export function memo<T>(component: T): T
  export const Fragment: any
  export const StrictMode: any
  export const cloneElement: any
  const React: any
  export default React
}

declare module 'react-dom' {
  export const createPortal: any
}

declare module 'react-dom/client' {
  export const createRoot: any
}

declare module 'react/jsx-runtime' {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
  export const StrictMode: any
  export const cloneElement: any
}

declare module 'recharts' {
  export const ResponsiveContainer: any
  export const LineChart: any
  export const Line: any
  export const XAxis: any
  export const YAxis: any
  export const CartesianGrid: any
  export const Tooltip: any
  export const Legend: any
  export const ReferenceLine: any
  export const AreaChart: any
  export const Area: any
  export const BarChart: any
  export const Bar: any
  export const Cell: any
  export const ScatterChart: any
  export const Scatter: any
  export const ComposedChart: any
  export const ReferenceArea: any
}

declare module '*.png' {
  const src: string
  export default src
}

declare module 'vite' {
  export const defineConfig: any
}

declare module '@vitejs/plugin-react' {
  const react: any
  export default react
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: any
  }
  interface IntrinsicElements {
    [elemName: string]: any
  }
}
