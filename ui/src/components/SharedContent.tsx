
interface request {
    content: string,
    setContent: (val: string) => void
}

const SharedContent = ({ content, setContent }: request) => {
    return (
        <div className="main-content flex-1 p-6 overflow-y-auto">
            <h2 className="text-xl font-semibold mb-3">Shared Content</h2>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="shared-textarea w-full h-32 p-2 border rounded resize-none bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            />
            <h3 className="mt-4 font-semibold">Rendered Preview:</h3>
            <div
                className="content-preview mt-2 p-3 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                dangerouslySetInnerHTML={{ __html: content }}
            />
        </div>
    )
}

export default SharedContent