import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { StateView } from './StateView';

describe('StateView forbidden', () => {
  it("sarlavha, tushuntirish va murojaat matnini ko'rsatadi, qayta urinish tugmasi yo'q", () => {
    const { container } = renderUI(
      <StateView
        status="forbidden"
        title="Bu bo'lim sizga yopiq"
        description="Klinika sozlamalarini faqat egasi va administrator ko'radi."
        contact="Kerak bo'lsa, Anvar Karimovga murojaat qiling."
        onRetry={() => {}}
        retryLabel="Qayta urinish"
      />,
    );
    expect(container.querySelector('[data-state="forbidden"]')).not.toBeNull();
    expect(screen.getByText("Bu bo'lim sizga yopiq")).toBeInTheDocument();
    expect(screen.getByText(/Anvar Karimovga murojaat qiling/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("403'da children/standart qiymat yo'q: faqat berilgan matn chiqadi", () => {
    const { container } = renderUI(<StateView status="forbidden" title="Ruxsat yo'q" />);
    expect(container.querySelector('[data-state="forbidden"]')?.textContent).toBe("Ruxsat yo'q");
  });
});
