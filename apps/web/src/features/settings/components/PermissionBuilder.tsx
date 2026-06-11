import type { PermissionDef } from '@dental/api-client';
import { Card, Checkbox, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { groupPermissionsByResource } from '../settings.mappers';

export function PermissionBuilder({
  permissions,
  selected,
  onChange,
}: {
  permissions: PermissionDef[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { t, i18n } = useTranslation();
  const groups = groupPermissionsByResource(permissions);

  const toggleOne = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange(next);
  };

  const toggleGroup = (codes: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const code of codes) {
      if (checked) next.add(code);
      else next.delete(code);
    }
    onChange(next);
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        {t('settings.perm_group_title')}
      </Text>
      {groups.map((group) => {
        const codes = group.permissions.map((p) => p.code);
        const allChecked = codes.every((c) => selected.has(c));
        const someChecked = codes.some((c) => selected.has(c));
        const label = t(`settings.perm_group.${group.resource}`, group.resource);
        return (
          <Card key={group.resource} withBorder padding="sm" radius="md">
            <Checkbox
              label={
                <Text fw={600} size="sm">
                  {label}
                </Text>
              }
              checked={allChecked}
              indeterminate={!allChecked && someChecked}
              onChange={(e) => toggleGroup(codes, e.currentTarget.checked)}
              mb="xs"
            />
            <Stack gap="xs" pl="md">
              {group.permissions.map((p) => {
                const desc = i18n.language === 'ru' ? p.descriptionRu : p.descriptionUz;
                return (
                  <Checkbox
                    key={p.code}
                    label={
                      <Stack gap={0}>
                        <Text size="sm" ff="monospace">
                          {p.code}
                        </Text>
                        {desc && (
                          <Text size="xs" c="dimmed">
                            {desc}
                          </Text>
                        )}
                      </Stack>
                    }
                    checked={selected.has(p.code)}
                    onChange={(e) => toggleOne(p.code, e.currentTarget.checked)}
                  />
                );
              })}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
