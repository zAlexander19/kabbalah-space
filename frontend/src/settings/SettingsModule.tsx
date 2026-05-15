import GcalSettingsCard from './GcalSettingsCard';

export default function SettingsModule() {
  return (
    <div className="max-w-2xl w-full px-4 py-6">
      <h1 className="ks-serif text-4xl text-ink-glow font-light mb-2">Configuración</h1>
      <p className="ks-body text-sm mb-10">Integraciones con servicios externos.</p>
      <GcalSettingsCard />
    </div>
  );
}
