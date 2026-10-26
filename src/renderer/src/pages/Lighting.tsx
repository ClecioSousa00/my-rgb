/**
 * Lighting screen.
 *
 * This is the original single-screen app, unchanged except for the global
 * controls that moved out of the top bar. Everything here still talks to the
 * same store and the same engine as before.
 */

import { useApp } from '../store'
import { ZoneRail } from '../components/ZoneRail'
import { StripPreview } from '../components/StripPreview'
import { PatternPicker } from '../components/PatternPicker'
import { GradientEditor } from '../components/GradientEditor'
import { ParamSliders } from '../components/ParamSliders'
import { LightingControls } from '../components/LightingControls'

export function LightingPage(): React.JSX.Element {
  // Nothing here reads the page state, but a page without the profile would
  // render an empty editor while the profile is still loading.
  const profile = useApp((s) => s.profile)

  return (
    <div className="flex min-h-0 flex-1">
      <ZoneRail />

      <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <LightingControls />

        {profile ? (
          <>
            <StripPreview />

            <div className="flex min-h-0 flex-1 gap-3">
              <PatternPicker />

              <div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto">
                <GradientEditor />
                <ParamSliders />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] text-ink-400">
            Carregando perfil…
          </div>
        )}
      </main>
    </div>
  )
}
