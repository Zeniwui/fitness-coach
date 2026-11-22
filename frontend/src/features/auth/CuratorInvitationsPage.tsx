import { PageHeader } from "../../ui/PageHeader";
import { CuratorInvitationsPanel } from "./CuratorInvitationsPanel";

export function CuratorInvitationsPage() {
  return (
    <section className="space-y-6 pb-8">
      <PageHeader
        title="Invitaciones"
        description="Emite enlaces privados de un solo uso para dar acceso a nuevos Atletas o Curadores."
      />
      <div className="max-w-3xl">
        <CuratorInvitationsPanel />
      </div>
    </section>
  );
}
