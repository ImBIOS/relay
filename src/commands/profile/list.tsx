import { Box, Text } from "ink";
import type React from "react";
import * as profiles from "../../config/profiles";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";

export default class ProfileList extends BaseCommand<typeof ProfileList> {
  static description = "List all profiles";
  static examples = ["<%= config.bin %> profile list"];

  async run(): Promise<void> {
    const profileList = profiles.listProfiles();
    const activeProfile = profiles.getActiveProfile();

    await this.renderApp(<ProfileListUI activeProfile={activeProfile} profiles={profileList} />);
  }
}

interface ProfileData {
  name: string;
  provider: string;
}

interface ProfileListUIProps {
  profiles: ProfileData[];
  activeProfile: ProfileData | null;
}

function ProfileListUI({
  profiles: profileList,
  activeProfile,
}: ProfileListUIProps): React.ReactElement {
  if (profileList.length === 0) {
    return (
      <Section title="Configuration Profiles">
        <Info>No profiles configured. Use 'relay profile create' to create one.</Info>
      </Section>
    );
  }

  return (
    <Section title="Configuration Profiles">
      <Box flexDirection="column">
        {profileList.map((profile) => {
          const isActive = profile.name === activeProfile?.name;
          return (
            <Box key={profile.name}>
              <Text color={isActive ? "green" : undefined}>
                {isActive ? "●" : "○"} {profile.name} ({profile.provider})
              </Text>
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Info>Active profile: {activeProfile?.name || "none"}</Info>
        </Box>
      </Box>
    </Section>
  );
}
