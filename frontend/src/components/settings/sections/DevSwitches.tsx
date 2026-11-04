import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { devSettingsQuery } from "@/api/queries";
import { setDevSettings, type DevSettings } from "@/api/settings";
import { Row, SaveNote, Section, Sheet } from "../parts";
import { useSave } from "../saveStatus";

///  +-----------------------------------------------------------------+
///  |                  DEV SWITCHES (development builds only)         |
///  +-----------------------------------------------------------------+
//
//  Take a guard out of the way while testing. They're server-wide and kept
//  in the database, so they hold across restarts and for whoever you sign
//  in as next. The server ignores them outside development.
///  +-----------------------------------------------------------------+

const OFF: DevSettings = { suppressEmail: false, allowSelfApproval: false };

export function DevSwitches() {
  const client = useQueryClient();
  const { save } = useSave();
  const { data = OFF } = useQuery(devSettingsQuery);

  const flip = (key: keyof DevSettings, on: boolean) => {
    const before = data;
    client.setQueryData(devSettingsQuery.queryKey, { ...data, [key]: on });
    void save(`dev-${key}`, async () => {
      try {
        await setDevSettings({ [key]: on });
      } catch (err) {
        client.setQueryData(devSettingsQuery.queryKey, before);
        throw err;
      }
    });
  };

  return (
    <Section label="Switches" note="Development only">
      <Sheet>
        <Row
          title="Send no email"
          desc="Notifications, the capex log and the SharePoint sync are written to the backend console instead of sent."
        >
          <Switch aria-label="Send no email" checked={data.suppressEmail} onCheckedChange={(on) => flip("suppressEmail", on)} />
          <SaveNote k="dev-suppressEmail" />
        </Row>
        <Row
          className="border-t border-line2"
          title="Allow self-approval"
          desc="The requester can be picked as their own approver, so one person can take a request through every step."
        >
          <Switch aria-label="Allow self-approval" checked={data.allowSelfApproval} onCheckedChange={(on) => flip("allowSelfApproval", on)} />
          <SaveNote k="dev-allowSelfApproval" />
        </Row>
      </Sheet>
    </Section>
  );
}
