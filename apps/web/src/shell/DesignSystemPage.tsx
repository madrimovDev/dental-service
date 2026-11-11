import {
  AlertBanner,
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
  Mono,
  PageHead,
  PatientFlag,
  Select,
  StatCard,
  StatusPill,
  Tabs,
  Tag,
} from '@dental/ui';
import { Button as MButton, Menu, Modal, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function DesignSystemPage() {
  const { t } = useTranslation();
  const { toggleColorScheme } = useMantineColorScheme();
  const [tab, setTab] = useState('info');
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHead
        title="Design System"
        subtitle="R0 fidelity — clinik .ds-* bilan solishtiring"
        actions={
          <Button variant="default" onClick={toggleColorScheme}>
            Theme
          </Button>
        }
      />

      <Card title="Buttons">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="default">Default</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <IconButton label="Bell" bordered dot>
            <svg width="18" height="18" />
          </IconButton>
        </div>
      </Card>

      <Card title="Forms">
        <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
          <Input label="Ism" placeholder="Bemor ismi" />
          <Input label="Xato" placeholder="Noto'g'ri" invalid />
          <Select
            label="Doktor"
            data={[
              { value: 'd1', label: 'Dr. Ali' },
              { value: 'd2', label: 'Dr. Vali' },
            ]}
          />
        </div>
      </Card>

      <Card title="Status / Tags">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill status="planned">Yozildi</StatusPill>
          <StatusPill status="confirmed">Tasdiqlandi</StatusPill>
          <StatusPill status="waiting">Kutmoqda</StatusPill>
          <StatusPill status="active">Kresloda</StatusPill>
          <StatusPill status="done">Yakunlandi</StatusPill>
          <StatusPill status="failed">Kelmadi</StatusPill>
          <Tag>Sug'urta</Tag>
          <Avatar name="Ali Valiyev" size="md" />
        </div>
      </Card>

      <Card title="PatientFlag">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <PatientFlag level="critical">Allergiya: penitsillin</PatientFlag>
          <PatientFlag level="attention">2 marta kelmagan</PatientFlag>
          <PatientFlag level="neutral">Telegram ulangan</PatientFlag>
          <PatientFlag level="info">Qarz 350 000</PatientFlag>
        </div>
      </Card>

      <Card title="AlertBanner">
        <div style={{ display: 'grid', gap: 10 }}>
          <AlertBanner tier={2} title="Allergiya">
            Penitsillin. Antikoagulyant qabul qiladi.
          </AlertBanner>
          <AlertBanner tier={3} action={{ label: "Ko'rish", onClick: () => {} }}>
            7 bemorni qayta chaqirish vaqti keldi
          </AlertBanner>
        </div>
      </Card>

      <Card title="StatCards">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <StatCard
            label="Kassa (bugun)"
            value={<Mono>2 400</Mono>}
            unit={`ming ${t('common.currency')}`}
            delta="12%"
            deltaDir="up"
            accent
            icon={<svg width="16" height="16" />}
          />
          <StatCard label="No-show" value={<Mono>3</Mono>} delta="2%" deltaDir="down" />
        </div>
      </Card>

      <Card title="Tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'info', label: "Ma'lumot" },
            { id: 'visits', label: 'Vizitlar' },
            { id: 'docs', label: 'Hujjatlar' },
          ]}
        />
        <div style={{ height: 12 }} />
        <Tabs value="Kun" variant="pill" items={['Kun', 'Hafta', 'Oy']} />
      </Card>

      {/* BRIDGE SINOVI: Mantine surface yuzalari (dropdown/overlay) — to'g'ridan
          --mantine-color-white / dark-scale ishlatadi. Bularni OCHIB fon'ni tekshir. */}
      <Card title="Mantine surface bridge (dropdown/menu/modal)">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            label="Dropdown ochib fon tekshir"
            data={[
              { value: 'a', label: 'Variant A' },
              { value: 'b', label: 'Variant B' },
            ]}
          />
          <BridgeMenu />
          <BridgeModal />
        </div>
      </Card>
    </div>
  );
}

// Bridge tekshiruvi uchun Mantine native Menu + Modal (token surface'ga mosligi)
function BridgeMenu() {
  return (
    <Menu>
      <Menu.Target>
        <MButton variant="default">Menu</MButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item>Tahrirlash</Menu.Item>
        <Menu.Item>O'chirish</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function BridgeModal() {
  const [opened, { open, close }] = useDisclosure(false);
  return (
    <>
      <MButton variant="default" onClick={open}>
        Modal
      </MButton>
      <Modal opened={opened} onClose={close} title="Bridge test">
        <p>Modal fon'i --surface bilan mos bo'lishi kerak.</p>
      </Modal>
    </>
  );
}
