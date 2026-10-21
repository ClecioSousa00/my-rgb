/**
 * Parameter specs shared by several patterns.
 *
 * Keeping them in one place means the label, the range and the explanation
 * stay the same everywhere the parameter appears.
 */

/**
 * Speed, used by every pattern that moves.
 */
export const RATE = {
  key: 'rate',
  label: 'Velocidade',
  type: 'number' as const,
  min: 0.05,
  max: 4,
  step: 0.05,
  default: 1,
  description:
    'Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.'
}
