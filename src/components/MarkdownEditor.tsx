import React, { useEffect, useRef, useMemo } from 'react';
import SimpleMDE from 'simplemde';
import 'simplemde/dist/simplemde.min.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly = false, placeholder }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const simpleMdeRef = useRef<SimpleMDE | null>(null);

  const options = useMemo<SimpleMDE.Options>(() => ({
    element: textareaRef.current ?? undefined,
    initialValue: value,
    autofocus: false,
    spellChecker: false,
    status: false, // Hide status bar
    toolbarTips: true,
    shortcuts: {
      toggleStrikethrough: "Cmd-Alt-S", // Example, can customize further
      toggleUnorderedList: "Cmd-Alt-L",
      toggleOrderedList: "Cmd-Alt-O",
      drawLink: "Cmd-Alt-K",
      drawImage: "Cmd-Alt-I",
      togglePreview: "Cmd-P",
      toggleSideBySide: "F9",
      toggleFullScreen: "F11"
    },
    previewRender: (plainText, preview) => { // Real-time preview (SimpleMDE handles this internally)
      // For more control, you could use react-markdown here, but SimpleMDE's is usually sufficient.
      setTimeout(() => {
        // @ts-ignore SimpleMDE types might be slightly off for preview
        preview.innerHTML = simpleMdeRef.current?.markdown(plainText) || '';
      }, 0);
      return "Loading preview...";
    },
    // Consider a minimal toolbar for a streamlined look
    toolbar: readOnly ? false : [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", "|",
      "preview", "side-by-side", "fullscreen", "|",
      "guide"
    ],
    readOnly: readOnly,
    placeholder: placeholder,
  }), [readOnly, placeholder, value]); // value in deps for initialValue, though SimpleMDE handles updates separately

  useEffect(() => {
    if (textareaRef.current && !simpleMdeRef.current) {
      const mde = new SimpleMDE(options);
      simpleMdeRef.current = mde;

      mde.codemirror.on('change', () => {
        onChange(mde.value());
      });

      // Set initial value if options.initialValue didn't catch it (e.g. if element wasn't ready)
      if (mde.value() !== value) {
        mde.value(value);
      }
    }

    return () => {
      if (simpleMdeRef.current) {
        // @ts-ignore
        simpleMdeRef.current.toTextArea(); // This is the official way to destroy SimpleMDE instance
        simpleMdeRef.current = null;
      }
    };
  }, [options, onChange, value]); // Rerun if options change (e.g. readOnly)

  // Handle external value changes (e.g. when a different note is selected)
  useEffect(() => {
    if (simpleMdeRef.current && simpleMdeRef.current.value() !== value) {
      const cursorPos = simpleMdeRef.current.codemirror.getCursor();
      simpleMdeRef.current.value(value);
      simpleMdeRef.current.codemirror.setCursor(cursorPos); // Try to maintain cursor position
    }
  }, [value]);

  // Handle readOnly changes
  useEffect(() => {
    if (simpleMdeRef.current) {
      simpleMdeRef.current.codemirror.setOption('readOnly', readOnly);
      // Consider hiding/showing toolbar based on readOnly status if SimpleMDE doesn't do it automatically
      const toolbarEl = (simpleMdeRef.current.gui.toolbar as HTMLElement);
      if (toolbarEl) {
        toolbarEl.style.display = readOnly ? 'none' : 'block';
      }
    }
  }, [readOnly]);

  return <textarea ref={textareaRef} style={{ display: 'none' }} />; // Hidden by SimpleMDE
};

export default MarkdownEditor;
