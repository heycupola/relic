import { THEME_COLORS } from "../../utils/constants";
import { PasswordForm } from "../forms/PasswordForm";
import { Modal } from "../shared/Modal";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newPassword: string) => void;
  verifyCurrentPassword: (password: string) => boolean;
}

export function ChangePasswordModal({
  visible,
  onClose,
  onSuccess,
  verifyCurrentPassword,
}: ChangePasswordModalProps) {
  const handleSubmit = (newPassword: string) => {
    onSuccess(newPassword);
    onClose();
  };

  return (
    <Modal visible={visible} title="Change Password" width={50} height={20}>
      <box flexDirection="column" width={46}>
        <box height={1} marginBottom={1}>
          <text fg={THEME_COLORS.accent}>[!] Your private key will be rewrapped</text>
        </box>
        <PasswordForm
          mode="change"
          onSubmit={handleSubmit}
          onCancel={onClose}
          currentPasswordRequired={true}
          onCurrentPasswordVerify={verifyCurrentPassword}
          width={46}
        />
      </box>
    </Modal>
  );
}
