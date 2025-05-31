// components/sheets/BaseSheet.js
import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";

export default function BaseSheet({ title, visible, onClose, children }) {
	return (
		<BottomModal visible={visible} onClose={onClose}>
			<ModalHeader title={title} onClose={onClose} />
			{children}
		</BottomModal>
	);
}
