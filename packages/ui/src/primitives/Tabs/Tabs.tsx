import { Tabs as MantineTabs } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './Tabs.module.css';

export type TabItem = string | { id: string; label: ReactNode };

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  variant?: 'underline' | 'pill';
}

const norm = (item: TabItem) => (typeof item === 'string' ? { id: item, label: item } : item);

export function Tabs({ items, value, onChange, variant = 'underline' }: TabsProps) {
  return (
    <MantineTabs
      value={value}
      onChange={(v) => v && onChange?.(v)}
      data-variant={variant}
      classNames={{ list: classes.list, tab: classes.tab }}
    >
      <MantineTabs.List>
        {items.map((it) => {
          const { id, label } = norm(it);
          return (
            <MantineTabs.Tab key={id} value={id}>
              {label}
            </MantineTabs.Tab>
          );
        })}
      </MantineTabs.List>
    </MantineTabs>
  );
}
